// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title CertRegistry
/// @notice Anchors Merkle roots of credential batches. No personal data is ever stored: only a root, a count and a label.
///         Verification of a single credential happens client-side against the root; this contract tells the verifier
///         who published the root, when, and whether the batch or a single credential was revoked.
///         Hackathon MVP. Unaudited.
contract CertRegistry {
    struct Batch {
        address issuer;
        uint64 publishedAt;
        uint32 count;
        bool revoked;
        string label; // organizer-chosen public label, e.g. "Bootcamp Cohort 7". Do not put personal data here.
    }

    // Everything is keyed by (issuer, root). A copied root published by someone else is a different, unrelated batch,
    // so nobody can squat or front-run an organizer's root.
    mapping(address => mapping(bytes32 => Batch)) private _batches;
    mapping(address => mapping(bytes32 => mapping(bytes32 => bool))) private _revokedLeaf; // issuer => root => leaf => revoked
    mapping(address => bytes32[]) private _byIssuer;

    event BatchPublished(bytes32 indexed root, address indexed issuer, uint32 count, string label);
    event BatchRevoked(bytes32 indexed root, address indexed issuer);
    event LeafRevoked(bytes32 indexed root, bytes32 indexed leaf, address indexed issuer);

    error EmptyRoot();
    error AlreadyPublished();
    error UnknownBatch();
    error LabelTooLong();

    function publish(bytes32 root, uint32 count, string calldata label) external {
        if (root == bytes32(0)) revert EmptyRoot();
        if (_batches[msg.sender][root].issuer != address(0)) revert AlreadyPublished();
        if (bytes(label).length > 80) revert LabelTooLong();
        _batches[msg.sender][root] = Batch(msg.sender, uint64(block.timestamp), count, false, label);
        _byIssuer[msg.sender].push(root);
        emit BatchPublished(root, msg.sender, count, label);
    }

    function revokeBatch(bytes32 root) external {
        Batch storage b = _batches[msg.sender][root];
        if (b.issuer == address(0)) revert UnknownBatch();
        b.revoked = true;
        emit BatchRevoked(root, msg.sender);
    }

    function revokeLeaf(bytes32 root, bytes32 leaf) external {
        if (_batches[msg.sender][root].issuer == address(0)) revert UnknownBatch();
        _revokedLeaf[msg.sender][root][leaf] = true;
        emit LeafRevoked(root, leaf, msg.sender);
    }

    /// @return issuer zero address when the root is unknown
    function batch(address issuerAddr, bytes32 root) external view returns (address issuer, uint64 publishedAt, uint32 count, bool revoked, string memory label) {
        Batch storage b = _batches[issuerAddr][root];
        return (b.issuer, b.publishedAt, b.count, b.revoked, b.label);
    }

    function isLeafRevoked(address issuer, bytes32 root, bytes32 leaf) external view returns (bool) {
        return _revokedLeaf[issuer][root][leaf];
    }

    function batchCount(address issuer) external view returns (uint256) {
        return _byIssuer[issuer].length;
    }

    function batchAt(address issuer, uint256 i) external view returns (bytes32) {
        return _byIssuer[issuer][i];
    }
}
