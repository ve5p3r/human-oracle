// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/**
 * @title HumanOracle
 * @notice Decentralized knowledge marketplace for verified human answers.
 *         Contributors submit battle-tested knowledge (infra, devops, edge cases).
 *         Agents pay USDC to query. Contributors earn 70% of query revenue.
 *
 *         Free tier:  hasAnswer(), previewAnswer(), getAnswersByTag()
 *         Premium:    getVerifiedAnswer() — costs premiumFee USDC
 *         x402:       REST API uses HTTP 402 micropayments ($0.01/query)
 *
 * @dev Deployed on Base Sepolia. USDC at 0x036CbD53842c5426634e7929541eC2318f3dCF7e
 */
contract HumanOracle is Ownable {
    using SafeERC20 for IERC20;

    // ─── Types ───────────────────────────────────────────────────────

    struct Answer {
        bytes32 contentHash;      // keccak256 of the full answer body
        string  sourceUrl;        // source permalink
        uint256 votes;            // community vote count at time of curation
        bool    accepted;         // was this the accepted answer?
        string[] tags;            // e.g. ["solidity", "kubernetes", "devops"]
        uint256 timestamp;        // block.timestamp when submitted
        string  questionTitle;    // human-readable question
        address contributor;      // who submitted (earns revenue share)
        uint256 queryCount;       // times this answer was paid-queried
    }

    struct Challenge {
        address challenger;
        uint256 stake;
        uint256 timestamp;
        bool    resolved;
    }

    // ─── State ───────────────────────────────────────────────────────

    IERC20 public immutable usdc;

    address public oracle;                              // authorized data submitter
    uint256 public premiumFee   = 1e6;                  // 1 USDC (6 decimals)
    uint256 public challengeFee = 500_000;              // 0.5 USDC
    uint256 public contributorShareBps = 7000;          // 70% to contributor (basis points)

    // queryHash → answers
    mapping(bytes32 => Answer[]) private _answers;
    // tag → queryHashes that contain it
    mapping(string => bytes32[]) private _tagIndex;
    // queryHash → answerIndex → Challenge[]
    mapping(bytes32 => mapping(uint256 => Challenge[])) private _challenges;
    // contributor → total earned
    mapping(address => uint256) public contributorEarnings;

    uint256 public totalAnswers;
    uint256 public totalQueries;                        // premium queries
    uint256 public totalRevenue;
    uint256 public totalContributorPayouts;

    // ─── Events ──────────────────────────────────────────────────────

    event AnswerSubmitted(bytes32 indexed queryHash, string questionTitle, uint256 votes, bool accepted, address indexed contributor);
    event AnswerQueried(bytes32 indexed queryHash, address indexed querier, uint256 fee, address indexed contributor, uint256 contributorPayout);
    event AnswerChallenged(bytes32 indexed queryHash, uint256 indexed answerIndex, address challenger, uint256 stake);
    event ChallengeResolved(bytes32 indexed queryHash, uint256 indexed answerIndex, uint256 challengeIndex, bool upheld, uint256 payout);
    event OracleChanged(address indexed oldOracle, address indexed newOracle);
    event FeesWithdrawn(address indexed to, uint256 amount);
    event ContributorShareUpdated(uint256 oldBps, uint256 newBps);

    // ─── Modifiers ───────────────────────────────────────────────────

    modifier onlyOracle() {
        require(msg.sender == oracle, "HumanOracle: caller is not the oracle");
        _;
    }

    // ─── Constructor ─────────────────────────────────────────────────

    constructor(address _usdc, address _oracle) Ownable(msg.sender) {
        usdc   = IERC20(_usdc);
        oracle = _oracle;
    }

    // ─── Free Queries (try before you buy) ───────────────────────────

    /// @notice Check whether a verified answer exists for a query.
    function hasAnswer(string calldata query) external view returns (bool) {
        return _answers[_queryHash(query)].length > 0;
    }

    /// @notice Preview answer quality before paying. Returns confidence signals.
    function previewAnswer(string calldata query)
        external
        view
        returns (
            bool exists,
            uint256 answerCount,
            uint256 topVotes,
            bool hasAccepted,
            string[] memory tags,
            string memory topTitle
        )
    {
        bytes32 qh = _queryHash(query);
        Answer[] storage ans = _answers[qh];
        answerCount = ans.length;
        exists = answerCount > 0;

        if (exists) {
            uint256 bestIdx;
            for (uint256 i; i < answerCount; ++i) {
                if (ans[i].votes > topVotes) {
                    topVotes = ans[i].votes;
                    bestIdx = i;
                }
                if (ans[i].accepted) hasAccepted = true;
            }
            tags = ans[bestIdx].tags;
            topTitle = ans[bestIdx].questionTitle;
        }
    }

    /// @notice Get lightweight metadata without paying.
    function getAnswerMeta(string calldata query)
        external
        view
        returns (uint256 count, string[] memory tags, uint256 topVotes)
    {
        bytes32 qh = _queryHash(query);
        Answer[] storage ans = _answers[qh];
        count = ans.length;
        if (count > 0) {
            tags = ans[0].tags;
            for (uint256 i; i < count; ++i) {
                if (ans[i].votes > topVotes) topVotes = ans[i].votes;
            }
        }
    }

    /// @notice List all query hashes associated with a tag.
    function getAnswersByTag(string calldata tag) external view returns (bytes32[] memory) {
        return _tagIndex[tag];
    }

    /// @notice Get answer count for a query hash directly.
    function getAnswerCount(bytes32 queryHash) external view returns (uint256) {
        return _answers[queryHash].length;
    }

    // ─── Premium Query ───────────────────────────────────────────────

    /// @notice Get the top verified answer. Caller must approve `premiumFee` USDC first.
    ///         70% of fee goes to the answer's contributor, 30% stays in protocol.
    function getVerifiedAnswer(string calldata query)
        external
        returns (
            bytes32 contentHash,
            string memory sourceUrl,
            uint256 votes,
            bool accepted,
            string[] memory tags,
            uint256 timestamp,
            string memory questionTitle
        )
    {
        bytes32 qh = _queryHash(query);
        Answer[] storage ans = _answers[qh];
        require(ans.length > 0, "HumanOracle: no answer found");

        // Collect payment
        usdc.safeTransferFrom(msg.sender, address(this), premiumFee);
        totalQueries++;
        totalRevenue += premiumFee;

        // Return the highest-voted answer
        uint256 best;
        for (uint256 i = 1; i < ans.length; ++i) {
            if (ans[i].votes > ans[best].votes) best = i;
        }

        Answer storage a = ans[best];
        a.queryCount++;

        // Pay contributor their share
        if (a.contributor != address(0)) {
            uint256 contributorPayout = (premiumFee * contributorShareBps) / 10000;
            usdc.safeTransfer(a.contributor, contributorPayout);
            contributorEarnings[a.contributor] += contributorPayout;
            totalContributorPayouts += contributorPayout;
            emit AnswerQueried(qh, msg.sender, premiumFee, a.contributor, contributorPayout);
        } else {
            emit AnswerQueried(qh, msg.sender, premiumFee, address(0), 0);
        }

        return (a.contentHash, a.sourceUrl, a.votes, a.accepted, a.tags, a.timestamp, a.questionTitle);
    }

    // ─── Oracle Submission (authorized curator) ──────────────────────

    /// @notice Submit a single verified answer. Oracle only.
    function submitAnswer(
        string calldata query,
        bytes32 contentHash,
        string calldata sourceUrl,
        uint256 votes,
        bool accepted,
        string[] calldata tags,
        string calldata questionTitle
    ) external onlyOracle {
        _addAnswer(query, contentHash, sourceUrl, votes, accepted, tags, questionTitle, msg.sender);
    }

    /// @notice Batch submit answers. Oracle only.
    function submitAnswerBatch(
        string[]   calldata queries,
        bytes32[]  calldata contentHashes,
        string[]   calldata sourceUrls,
        uint256[]  calldata voteCounts,
        bool[]     calldata acceptedFlags,
        string[][] calldata tagSets,
        string[]   calldata questionTitles
    ) external onlyOracle {
        uint256 len = queries.length;
        require(
            len == contentHashes.length &&
            len == sourceUrls.length &&
            len == voteCounts.length &&
            len == acceptedFlags.length &&
            len == tagSets.length &&
            len == questionTitles.length,
            "HumanOracle: array length mismatch"
        );
        for (uint256 i; i < len; ++i) {
            _addAnswer(queries[i], contentHashes[i], sourceUrls[i], voteCounts[i], acceptedFlags[i], tagSets[i], questionTitles[i], msg.sender);
        }
    }

    /// @notice Submit knowledge as a contributor (anyone can submit, oracle approves).
    function submitContribution(
        string calldata query,
        bytes32 contentHash,
        string calldata sourceUrl,
        uint256 votes,
        bool accepted,
        string[] calldata tags,
        string calldata questionTitle,
        address contributor
    ) external onlyOracle {
        _addAnswer(query, contentHash, sourceUrl, votes, accepted, tags, questionTitle, contributor);
    }

    // ─── Challenge ───────────────────────────────────────────────────

    /// @notice Challenge an answer's validity by staking USDC.
    function challengeAnswer(bytes32 queryHash, uint256 index) external {
        require(index < _answers[queryHash].length, "HumanOracle: invalid index");
        usdc.safeTransferFrom(msg.sender, address(this), challengeFee);

        _challenges[queryHash][index].push(Challenge({
            challenger: msg.sender,
            stake: challengeFee,
            timestamp: block.timestamp,
            resolved: false
        }));

        emit AnswerChallenged(queryHash, index, msg.sender, challengeFee);
    }

    /// @notice Resolve a challenge. If upheld, challenger gets 2x stake.
    function resolveChallenge(bytes32 queryHash, uint256 answerIndex, uint256 challengeIndex, bool upheld) external onlyOwner {
        Challenge storage c = _challenges[queryHash][answerIndex][challengeIndex];
        require(!c.resolved, "HumanOracle: already resolved");
        c.resolved = true;

        if (upheld) {
            uint256 reward = c.stake * 2;
            uint256 bal = usdc.balanceOf(address(this));
            uint256 payout = reward > bal ? bal : reward;
            usdc.safeTransfer(c.challenger, payout);
            emit ChallengeResolved(queryHash, answerIndex, challengeIndex, true, payout);
        } else {
            emit ChallengeResolved(queryHash, answerIndex, challengeIndex, false, 0);
        }
    }

    /// @notice Get challenge details
    function getChallenge(bytes32 queryHash, uint256 answerIndex, uint256 challengeIndex)
        external view returns (address challenger, uint256 stake, uint256 timestamp, bool resolved)
    {
        Challenge storage c = _challenges[queryHash][answerIndex][challengeIndex];
        return (c.challenger, c.stake, c.timestamp, c.resolved);
    }

    // ─── Admin ───────────────────────────────────────────────────────

    function setOracle(address _oracle) external onlyOwner {
        emit OracleChanged(oracle, _oracle);
        oracle = _oracle;
    }

    function setPremiumFee(uint256 _fee) external onlyOwner {
        premiumFee = _fee;
    }

    function setChallengeFee(uint256 _fee) external onlyOwner {
        challengeFee = _fee;
    }

    function setContributorShare(uint256 _bps) external onlyOwner {
        require(_bps <= 10000, "HumanOracle: invalid bps");
        emit ContributorShareUpdated(contributorShareBps, _bps);
        contributorShareBps = _bps;
    }

    function withdrawFees(address to) external onlyOwner {
        uint256 bal = usdc.balanceOf(address(this));
        require(bal > 0, "HumanOracle: nothing to withdraw");
        usdc.safeTransfer(to, bal);
        emit FeesWithdrawn(to, bal);
    }

    // ─── Internals ───────────────────────────────────────────────────

    function _queryHash(string calldata query) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked(_normalize(query)));
    }

    /// @dev Lowercase ASCII normalization. Good enough for English tech queries.
    function _normalize(string calldata s) internal pure returns (string memory) {
        bytes memory b = bytes(s);
        for (uint256 i; i < b.length; ++i) {
            if (b[i] >= 0x41 && b[i] <= 0x5A) b[i] = bytes1(uint8(b[i]) + 32);
        }
        return string(b);
    }

    function _addAnswer(
        string calldata query,
        bytes32 contentHash,
        string calldata sourceUrl,
        uint256 votes,
        bool accepted,
        string[] calldata tags,
        string calldata questionTitle,
        address contributor
    ) internal {
        bytes32 qh = _queryHash(query);

        string[] memory tagsCopy = new string[](tags.length);
        for (uint256 i; i < tags.length; ++i) tagsCopy[i] = tags[i];

        _answers[qh].push(Answer({
            contentHash:   contentHash,
            sourceUrl:     sourceUrl,
            votes:         votes,
            accepted:      accepted,
            tags:          tagsCopy,
            timestamp:     block.timestamp,
            questionTitle: questionTitle,
            contributor:   contributor,
            queryCount:    0
        }));

        for (uint256 i; i < tags.length; ++i) {
            _tagIndex[tags[i]].push(qh);
        }

        totalAnswers++;
        emit AnswerSubmitted(qh, questionTitle, votes, accepted, contributor);
    }
}
