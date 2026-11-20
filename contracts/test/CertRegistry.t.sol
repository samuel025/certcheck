// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
import "forge-std/Test.sol";
import "../src/CertRegistry.sol";

contract CertRegistryTest is Test {
    CertRegistry r; address alice = address(0xA11CE); address bob = address(0xB0B);
    bytes32 root = keccak256("root"); bytes32 leaf = keccak256("leaf");

    function setUp() public { r = new CertRegistry(); }

    function test_publish_and_read() public {
        vm.warp(1000); vm.prank(alice); r.publish(root, 25, "Cohort 7");
        (address issuer, uint64 at, uint32 count, bool revoked, string memory label) = r.batch(alice, root);
        assertEq(issuer, alice); assertEq(at, 1000); assertEq(count, 25); assertFalse(revoked); assertEq(label, "Cohort 7");
        assertEq(r.batchCount(alice), 1); assertEq(r.batchAt(alice, 0), root);
    }
    function test_unknown_root_reads_zero_issuer() public view { (address issuer,,,,) = r.batch(alice, root); assertEq(issuer, address(0)); }
    function test_cannot_publish_twice_or_zero() public {
        vm.prank(alice); r.publish(root, 1, "x");
        vm.prank(alice); vm.expectRevert(CertRegistry.AlreadyPublished.selector); r.publish(root, 1, "again");
        vm.expectRevert(CertRegistry.EmptyRoot.selector); r.publish(bytes32(0), 1, "x");
    }
    function test_label_limit() public {
        string memory long = "01234567890123456789012345678901234567890123456789012345678901234567890123456789X";
        vm.expectRevert(CertRegistry.LabelTooLong.selector); r.publish(root, 1, long);
    }
    function test_copied_root_cannot_be_squatted() public {            // front-running: bob publishes alice's root first
        vm.prank(bob); r.publish(root, 99, "squat");
        vm.prank(alice); r.publish(root, 25, "Cohort 7");                // alice still publishes fine
        (address i1,, uint32 c1,,) = r.batch(alice, root); (address i2,, uint32 c2,,) = r.batch(bob, root);
        assertEq(i1, alice); assertEq(c1, 25); assertEq(i2, bob); assertEq(c2, 99);
    }
    function test_only_the_issuer_can_revoke_their_own_batch() public {
        vm.prank(alice); r.publish(root, 1, "x");
        vm.prank(bob); vm.expectRevert(CertRegistry.UnknownBatch.selector); r.revokeBatch(root);   // bob has no such batch
        (,,, bool stillOk,) = r.batch(alice, root); assertFalse(stillOk);
        vm.prank(alice); r.revokeBatch(root);
        (,,, bool revoked,) = r.batch(alice, root); assertTrue(revoked);
    }
    function test_leaf_revocation_is_per_issuer() public {
        vm.prank(alice); r.publish(root, 1, "x"); vm.prank(bob); r.publish(root, 1, "y");
        vm.prank(alice); r.revokeLeaf(root, leaf);
        assertTrue(r.isLeafRevoked(alice, root, leaf)); assertFalse(r.isLeafRevoked(bob, root, leaf)); assertFalse(r.isLeafRevoked(alice, root, keccak256("other")));
        vm.prank(bob); vm.expectRevert(CertRegistry.UnknownBatch.selector); r.revokeLeaf(keccak256("nope"), leaf);
    }
    function test_revoke_unknown_reverts() public {
        vm.expectRevert(CertRegistry.UnknownBatch.selector); r.revokeBatch(root);
        vm.expectRevert(CertRegistry.UnknownBatch.selector); r.revokeLeaf(root, leaf);
    }
    function test_events() public {
        vm.expectEmit(true, true, false, true); emit CertRegistry.BatchPublished(root, alice, 3, "L");
        vm.prank(alice); r.publish(root, 3, "L");
    }
}
