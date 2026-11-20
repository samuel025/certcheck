// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title CertRegistryV2
/// @notice Same read interface as CertRegistry (v1) plus a revenue rail:
///  - a small fee per certificate published, with a monthly free allowance per issuer;
///  - prepaid credits that anyone can buy for any issuer (sponsor-funded batches);
///  - a paid, owner-reviewed "verified issuer" listing, held in escrow until approved or refunded;
///  - public on-chain totals so anyone can audit what was collected.
/// No personal data is stored. Hackathon MVP. Unaudited.
contract CertRegistryV2 {
    // ---------- batches (read ABI identical to v1) ----------
    struct Batch { address issuer; uint64 publishedAt; uint32 count; bool revoked; string label; }
    mapping(address => mapping(bytes32 => Batch)) private _batches;
    mapping(address => mapping(bytes32 => mapping(bytes32 => bool))) private _revokedLeaf;
    mapping(address => bytes32[]) private _byIssuer;

    // ---------- pricing (owner-adjustable within hard caps) ----------
    address public owner;
    address public pendingOwner;
    address public treasury;
    uint256 public pricePerCert;       // wei per certificate beyond the free allowance
    uint32  public freeCerts;          // free certificates per issuer per FREE_WINDOW
    uint256 public verificationFee;    // wei, one-off per review (valid for the period the owner grants)
    uint256 public constant MAX_PRICE = 0.01 ether;
    uint256 public constant MAX_VERIFICATION_FEE = 10 ether;
    uint32  public constant MAX_FREE = 1000;
    uint256 public constant FREE_WINDOW = 30 days;
    uint256 public constant MAX_VERIFY_PERIOD = 5 * 365 days;

    mapping(address => uint256) public credits;                       // prepaid certificate credits per issuer
    mapping(address => mapping(uint256 => uint32)) public freeUsed;   // issuer => window index => free certificates used

    // ---------- verified issuers ----------
    struct Issuer { string name; string url; uint64 verifiedUntil; }
    struct Pending { uint256 paid; string name; string url; }
    mapping(address => Issuer) private _issuers;
    mapping(address => Pending) private _pending;
    mapping(address => bool) private _everVerified;
    mapping(address => uint256) public refundable;   // refunds waiting to be claimed (rejected or cancelled reviews)
    uint256 public pendingTotal;                      // fees held in escrow for reviews not yet decided
    uint256 public refundableTotal;

    // ---------- public totals ----------
    uint256 public totalFees;               // wei ever earned (certificate fees + credits sold + approved verification fees)
    uint256 public feesFromPublishing;
    uint256 public feesFromCredits;
    uint256 public feesFromVerification;
    uint256 public totalBatches;
    uint256 public totalCertificates;
    uint256 public creditsSold;
    uint256 public issuerCount;             // distinct addresses that ever published
    uint256 public verifiedCount;           // distinct addresses ever approved as verified
    uint256 public totalWithdrawn;
    mapping(address => bool) private _seen;

    uint256 private _lock = 1;

    event BatchPublished(bytes32 indexed root, address indexed issuer, uint32 count, string label, uint256 feePaid, uint32 freeUsedNow, uint256 creditsUsedNow);
    event BatchRevoked(bytes32 indexed root, address indexed issuer);
    event LeafRevoked(bytes32 indexed root, bytes32 indexed leaf, address indexed issuer);
    event CreditsBought(address indexed buyer, address indexed forIssuer, uint256 amount, uint256 cost);
    event VerificationRequested(address indexed issuer, string name, string url, uint256 paid);
    event VerificationApproved(address indexed issuer, string name, uint64 until, uint256 fee);
    event VerificationRefundQueued(address indexed issuer, uint256 amount);
    event RefundClaimed(address indexed issuer, uint256 amount);
    event Withdrawn(address indexed treasury, uint256 amount);
    event PricingChanged(uint256 pricePerCert, uint32 freeCerts, uint256 verificationFee);
    event TreasuryChanged(address treasury);
    event OwnershipTransferStarted(address indexed from, address indexed to);
    event OwnershipTransferred(address indexed from, address indexed to);

    error EmptyRoot(); error AlreadyPublished(); error UnknownBatch(); error LabelTooLong(); error ZeroCount();
    error InsufficientFee(uint256 needed); error NotOwner(); error BadParam(); error NothingToWithdraw();
    error NoPendingReview(); error ReviewAlreadyPending(); error TransferFailed(); error Reentrant(); error NothingToClaim();

    modifier onlyOwner() { if (msg.sender != owner) revert NotOwner(); _; }
    modifier nonReentrant() { if (_lock != 1) revert Reentrant(); _lock = 2; _; _lock = 1; }

    constructor(address treasury_, uint256 pricePerCert_, uint32 freeCerts_, uint256 verificationFee_) {
        if (treasury_ == address(0)) revert BadParam();
        owner = msg.sender; treasury = treasury_; _setPricing(pricePerCert_, freeCerts_, verificationFee_);
    }

    // =====================================================================
    // publishing
    // =====================================================================
    /// @notice What publishing `count` certificates would cost this issuer right now.
    function quote(address issuer, uint32 count) public view returns (uint256 fee, uint32 freeNow, uint256 creditsNow) {
        uint32 used = freeUsed[issuer][block.timestamp / FREE_WINDOW];
        uint32 left = freeCerts > used ? freeCerts - used : 0;
        freeNow = count < left ? count : left;
        uint256 remaining = uint256(count) - freeNow;
        uint256 have = credits[issuer];
        creditsNow = remaining < have ? remaining : have;
        fee = (remaining - creditsNow) * pricePerCert;
    }

    function publish(bytes32 root, uint32 count, string calldata label) external payable nonReentrant {
        if (root == bytes32(0)) revert EmptyRoot();
        if (count == 0) revert ZeroCount();
        if (_batches[msg.sender][root].issuer != address(0)) revert AlreadyPublished();
        if (bytes(label).length > 80) revert LabelTooLong();
        (uint256 fee, uint32 freeNow, uint256 creditsNow) = quote(msg.sender, count);
        if (msg.value < fee) revert InsufficientFee(fee);
        // effects
        if (freeNow > 0) freeUsed[msg.sender][block.timestamp / FREE_WINDOW] += freeNow;
        if (creditsNow > 0) credits[msg.sender] -= creditsNow;
        _batches[msg.sender][root] = Batch(msg.sender, uint64(block.timestamp), count, false, label);
        _byIssuer[msg.sender].push(root);
        totalBatches++; totalCertificates += count;
        if (!_seen[msg.sender]) { _seen[msg.sender] = true; issuerCount++; }
        totalFees += fee; feesFromPublishing += fee;
        emit BatchPublished(root, msg.sender, count, label, fee, freeNow, creditsNow);
        // interactions: return anything paid above the price
        if (msg.value > fee) _send(msg.sender, msg.value - fee);
    }

    // =====================================================================
    // credits (a sponsor can buy for someone else)
    // =====================================================================
    function buyCredits(address forIssuer, uint256 amount) external payable nonReentrant {
        if (forIssuer == address(0) || amount == 0 || amount > 1_000_000) revert BadParam();
        uint256 cost = amount * pricePerCert;
        if (msg.value < cost) revert InsufficientFee(cost);
        credits[forIssuer] += amount; creditsSold += amount; totalFees += cost; feesFromCredits += cost;
        emit CreditsBought(msg.sender, forIssuer, amount, cost);
        if (msg.value > cost) _send(msg.sender, msg.value - cost);
    }

    // =====================================================================
    // verified issuers (paid review, escrowed until the owner decides)
    // =====================================================================
    function requestVerification(string calldata name, string calldata url) external payable nonReentrant {
        if (bytes(name).length == 0 || bytes(name).length > 80 || bytes(url).length > 120) revert BadParam();
        if (_pending[msg.sender].paid != 0 || bytes(_pending[msg.sender].name).length != 0) revert ReviewAlreadyPending();
        uint256 fee = verificationFee;
        if (msg.value < fee) revert InsufficientFee(fee);
        _pending[msg.sender] = Pending(fee, name, url); pendingTotal += fee;
        emit VerificationRequested(msg.sender, name, url, fee);
        if (msg.value > fee) _send(msg.sender, msg.value - fee);
    }

    /// @notice The issuer withdraws an undecided request; the fee becomes claimable.
    function cancelVerification() external {
        Pending memory p = _pending[msg.sender]; if (bytes(p.name).length == 0) revert NoPendingReview();
        delete _pending[msg.sender]; pendingTotal -= p.paid; _queueRefund(msg.sender, p.paid);
    }

    function approveVerification(address issuer, uint64 until) external onlyOwner {
        Pending memory p = _pending[issuer]; if (bytes(p.name).length == 0) revert NoPendingReview();
        if (until <= block.timestamp || until > block.timestamp + MAX_VERIFY_PERIOD) revert BadParam();
        delete _pending[issuer]; pendingTotal -= p.paid;
        _issuers[issuer] = Issuer(p.name, p.url, until);
        if (!_everVerified[issuer]) { _everVerified[issuer] = true; verifiedCount++; }
        totalFees += p.paid; feesFromVerification += p.paid;
        emit VerificationApproved(issuer, p.name, until, p.paid);
    }

    function rejectVerification(address issuer) external onlyOwner {
        Pending memory p = _pending[issuer]; if (bytes(p.name).length == 0) revert NoPendingReview();
        delete _pending[issuer]; pendingTotal -= p.paid; _queueRefund(issuer, p.paid);
    }

    /// @notice The owner can also remove a listing (for example if an issuer's address is compromised). No refund.
    function revokeVerification(address issuer) external onlyOwner { _issuers[issuer].verifiedUntil = 0; }

    function claimRefund() external nonReentrant {
        uint256 a = refundable[msg.sender]; if (a == 0) revert NothingToClaim();
        refundable[msg.sender] = 0; refundableTotal -= a; emit RefundClaimed(msg.sender, a); _send(msg.sender, a);
    }
    function _queueRefund(address to, uint256 amount) private { if (amount == 0) return; refundable[to] += amount; refundableTotal += amount; emit VerificationRefundQueued(to, amount); }

    function issuerInfo(address a) external view returns (string memory name, string memory url, uint64 verifiedUntil, bool verified) {
        Issuer storage i = _issuers[a]; return (i.name, i.url, i.verifiedUntil, i.verifiedUntil > block.timestamp);
    }
    function pendingReview(address a) external view returns (uint256 paid, string memory name, string memory url) { Pending storage p = _pending[a]; return (p.paid, p.name, p.url); }

    // =====================================================================
    // revocation + reads (same interface as v1)
    // =====================================================================
    function revokeBatch(bytes32 root) external {
        Batch storage b = _batches[msg.sender][root]; if (b.issuer == address(0)) revert UnknownBatch();
        b.revoked = true; emit BatchRevoked(root, msg.sender);
    }
    function revokeLeaf(bytes32 root, bytes32 leaf) external {
        if (_batches[msg.sender][root].issuer == address(0)) revert UnknownBatch();
        _revokedLeaf[msg.sender][root][leaf] = true; emit LeafRevoked(root, leaf, msg.sender);
    }
    function batch(address issuerAddr, bytes32 root) external view returns (address issuer_, uint64 publishedAt, uint32 count, bool revoked, string memory label) {
        Batch storage b = _batches[issuerAddr][root]; return (b.issuer, b.publishedAt, b.count, b.revoked, b.label);
    }
    function isLeafRevoked(address issuerAddr, bytes32 root, bytes32 leaf) external view returns (bool) { return _revokedLeaf[issuerAddr][root][leaf]; }
    function batchCount(address issuerAddr) external view returns (uint256) { return _byIssuer[issuerAddr].length; }
    function batchAt(address issuerAddr, uint256 i) external view returns (bytes32) { return _byIssuer[issuerAddr][i]; }
    function stats() external view returns (uint256 fees, uint256 batches, uint256 certificates, uint256 issuers, uint256 verified, uint256 withdrawn, uint256 balance) {
        return (totalFees, totalBatches, totalCertificates, issuerCount, verifiedCount, totalWithdrawn, address(this).balance);
    }

    // =====================================================================
    // money out and admin
    // =====================================================================
    /// @notice Anyone may trigger this. Only earned fees move: escrowed reviews and unclaimed refunds are never touched.
    function withdraw() external nonReentrant {
        uint256 locked = pendingTotal + refundableTotal;
        uint256 bal = address(this).balance; if (bal <= locked) revert NothingToWithdraw();
        uint256 amount = bal - locked; totalWithdrawn += amount; emit Withdrawn(treasury, amount); _send(treasury, amount);
    }
    function setPricing(uint256 p, uint32 f, uint256 v) external onlyOwner { _setPricing(p, f, v); }
    function _setPricing(uint256 p, uint32 f, uint256 v) private {
        if (p > MAX_PRICE || f > MAX_FREE || v > MAX_VERIFICATION_FEE) revert BadParam();
        pricePerCert = p; freeCerts = f; verificationFee = v; emit PricingChanged(p, f, v);
    }
    function setTreasury(address t) external onlyOwner { if (t == address(0)) revert BadParam(); treasury = t; emit TreasuryChanged(t); }
    function transferOwnership(address to) external onlyOwner { if (to == address(0)) revert BadParam(); pendingOwner = to; emit OwnershipTransferStarted(owner, to); }
    function acceptOwnership() external { if (msg.sender != pendingOwner) revert NotOwner(); emit OwnershipTransferred(owner, msg.sender); owner = msg.sender; pendingOwner = address(0); }

    function _send(address to, uint256 amount) private { (bool ok,) = to.call{value: amount}(""); if (!ok) revert TransferFailed(); }
}
