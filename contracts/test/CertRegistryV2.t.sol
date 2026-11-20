// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
import "forge-std/Test.sol";
import "../src/CertRegistry.sol";
import "../src/CertRegistryV2.sol";

contract Greedy {          // tries to re-enter while receiving a refund
    CertRegistryV2 r; uint8 mode;
    constructor(CertRegistryV2 r_) { r = r_; }
    function go(uint8 mode_, bytes32 root, uint32 count) external payable { mode = mode_; r.publish{value: msg.value}(root, count, "greedy"); }
    function claimGo() external { r.claimRefund(); }
    receive() external payable {
        if (mode == 1) r.publish(keccak256("again"), 1, "x");
        if (mode == 2) r.claimRefund();
        if (mode == 3) r.withdraw();
    }
}
contract Rejecter { receive() external payable { revert("no thanks"); } }

contract CertRegistryV2Test is Test {
    CertRegistryV2 r; address owner = address(this); address treasury = address(0x7E57); address alice = address(0xA11CE); address bob = address(0xB0B); address sponsor = address(0x5B0);
    uint256 constant PRICE = 1e14; uint256 constant VFEE = 1 ether;
    function setUp() public { r = new CertRegistryV2(treasury, PRICE, 25, VFEE); vm.deal(alice, 100 ether); vm.deal(bob, 100 ether); vm.deal(sponsor, 100 ether); }
    receive() external payable {}
    function _pub(address who, bytes32 root, uint32 count, uint256 value) internal { vm.prank(who); r.publish{value: value}(root, count, "L"); }
    function _balanceEquation() internal view { (uint256 fees,,,,, uint256 wd, uint256 bal) = r.stats(); assertEq(bal, (fees - wd) + r.pendingTotal() + r.refundableTotal(), "money in = earned-not-withdrawn + escrow + refunds"); }

    // ---------- fee maths ----------
    function test_free_allowance_then_paid() public {
        (uint256 fee, uint32 free_, uint256 cr) = r.quote(alice, 20); assertEq(fee, 0); assertEq(free_, 20); assertEq(cr, 0);
        _pub(alice, keccak256("a"), 20, 0); assertEq(r.freeUsed(alice, block.timestamp / 30 days), 20);
        (fee, free_,) = r.quote(alice, 10); assertEq(free_, 5); assertEq(fee, 5 * PRICE);                 // 5 free left, 5 paid
        _pub(alice, keccak256("b"), 10, 5 * PRICE); assertEq(r.totalFees(), 5 * PRICE); assertEq(r.feesFromPublishing(), 5 * PRICE);
        _balanceEquation();
    }
    function test_exactly_free_allowance_costs_nothing_and_one_more_costs_one() public {
        _pub(alice, keccak256("a"), 25, 0); (uint256 fee,,) = r.quote(bob, 26); assertEq(fee, PRICE); (fee,,) = r.quote(alice, 1); assertEq(fee, PRICE);
    }
    function test_insufficient_fee_reverts_with_the_needed_amount() public {
        vm.prank(alice); vm.expectRevert(abi.encodeWithSelector(CertRegistryV2.InsufficientFee.selector, 75 * PRICE)); r.publish{value: 75 * PRICE - 1}(keccak256("a"), 100, "L");
        assertEq(r.totalBatches(), 0, "nothing recorded on a failed publish");
    }
    function test_overpayment_is_refunded_exactly() public {
        uint256 before = alice.balance; _pub(alice, keccak256("a"), 30, 50 * PRICE);            // owes 5*PRICE
        assertEq(before - alice.balance, 5 * PRICE); assertEq(address(r).balance, 5 * PRICE); _balanceEquation();
    }
    function test_free_allowance_resets_each_30_day_window() public {
        _pub(alice, keccak256("a"), 25, 0); (uint256 fee,,) = r.quote(alice, 25); assertEq(fee, 25 * PRICE);
        vm.warp(block.timestamp + 30 days); (fee,,) = r.quote(alice, 25); assertEq(fee, 0, "new window, new allowance");
    }
    function test_free_allowance_is_per_issuer() public { _pub(alice, keccak256("a"), 25, 0); (uint256 fee,,) = r.quote(bob, 25); assertEq(fee, 0); }
    function _expected(uint32 count, uint32 free_, uint32 creditAmt) internal pure returns (uint256 expFree, uint256 expCredits, uint256 expPaid) {
        expFree = count < free_ ? count : free_; uint256 rem = uint256(count) - expFree; expCredits = rem < creditAmt ? rem : creditAmt; expPaid = rem - expCredits;
    }
    function _setupFuzz(uint32 free_, uint64 price, uint32 creditAmt) internal returns (CertRegistryV2 q) {
        q = new CertRegistryV2(treasury, price, free_, VFEE); vm.deal(alice, 1000 ether);
        if (creditAmt > 0) { vm.prank(alice); q.buyCredits{value: uint256(creditAmt) * price}(alice, creditAmt); }
    }
    function testFuzz_fee_is_exactly_the_paid_part(uint32 count, uint32 free_, uint64 price, uint32 creditAmt) public {
        count = uint32(bound(count, 1, 100000)); free_ = uint32(bound(free_, 0, 1000)); price = uint64(bound(price, 0, 0.01 ether)); creditAmt = uint32(bound(creditAmt, 0, 5000));
        CertRegistryV2 q = _setupFuzz(free_, price, creditAmt);
        (uint256 fee, uint32 freeNow, uint256 creditsNow) = q.quote(alice, count);
        (uint256 eF, uint256 eC, uint256 eP) = _expected(count, free_, creditAmt);
        assertEq(uint256(freeNow), eF); assertEq(creditsNow, eC); assertEq(fee, eP * price);
        uint256 before = alice.balance; vm.prank(alice); q.publish{value: fee + 12345}(keccak256("z"), count, "L");
        assertEq(before - alice.balance, fee, "pays exactly the quote, the rest comes back");
        (uint256 fees,,,,, uint256 wd, uint256 bal) = q.stats(); assertEq(bal, (fees - wd) + q.pendingTotal() + q.refundableTotal());
    }

    // ---------- credits and sponsors ----------
    function test_credits_are_used_before_paying() public {
        vm.prank(alice); r.buyCredits{value: 40 * PRICE}(alice, 40); assertEq(r.credits(alice), 40); assertEq(r.feesFromCredits(), 40 * PRICE);
        (uint256 fee, uint32 freeNow, uint256 cr) = r.quote(alice, 100); assertEq(freeNow, 25); assertEq(cr, 40); assertEq(fee, 35 * PRICE);
        _pub(alice, keccak256("a"), 100, 35 * PRICE); assertEq(r.credits(alice), 0); assertEq(r.totalFees(), 75 * PRICE);
        _balanceEquation();
    }
    function test_a_sponsor_can_fund_someone_elses_batch() public {
        vm.prank(sponsor); r.buyCredits{value: 100 * PRICE}(bob, 100); assertEq(r.credits(bob), 100); assertEq(r.credits(sponsor), 0);
        uint256 b0 = bob.balance; _pub(bob, keccak256("b"), 125, 0); assertEq(bob.balance, b0, "bob paid nothing, the sponsor did"); assertEq(r.credits(bob), 0);
    }
    function test_credit_purchase_bounds_and_refund() public {
        vm.prank(alice); vm.expectRevert(CertRegistryV2.BadParam.selector); r.buyCredits{value: 0}(alice, 0);
        vm.prank(alice); vm.expectRevert(CertRegistryV2.BadParam.selector); r.buyCredits{value: 0}(address(0), 1);
        vm.prank(alice); vm.expectRevert(CertRegistryV2.BadParam.selector); r.buyCredits{value: 0}(alice, 1_000_001);
        vm.prank(alice); vm.expectRevert(abi.encodeWithSelector(CertRegistryV2.InsufficientFee.selector, 10 * PRICE)); r.buyCredits{value: 10 * PRICE - 1}(alice, 10);
        uint256 b0 = alice.balance; vm.prank(alice); r.buyCredits{value: 1 ether}(alice, 10); assertEq(b0 - alice.balance, 10 * PRICE);
    }

    // ---------- v1 behaviour kept ----------
    function test_duplicates_zero_root_zero_count_long_label() public {
        _pub(alice, keccak256("a"), 1, 0);
        vm.prank(alice); vm.expectRevert(CertRegistryV2.AlreadyPublished.selector); r.publish(keccak256("a"), 1, "again");
        vm.expectRevert(CertRegistryV2.EmptyRoot.selector); r.publish(bytes32(0), 1, "x");
        vm.expectRevert(CertRegistryV2.ZeroCount.selector); r.publish(keccak256("z"), 0, "x");
        vm.expectRevert(CertRegistryV2.LabelTooLong.selector); r.publish(keccak256("y"), 1, "01234567890123456789012345678901234567890123456789012345678901234567890123456789X");
    }
    function test_copied_root_cannot_be_squatted() public { _pub(bob, keccak256("r"), 20, 0); _pub(alice, keccak256("r"), 25, 0); (address i1,, uint32 c1,,) = r.batch(alice, keccak256("r")); (address i2,, uint32 c2,,) = r.batch(bob, keccak256("r")); assertEq(i1, alice); assertEq(c1, 25); assertEq(i2, bob); assertEq(c2, 20); }
    function test_revocation_is_per_issuer_and_per_leaf() public {
        _pub(alice, keccak256("r"), 3, 0); _pub(bob, keccak256("r"), 3, 0);
        vm.prank(alice); r.revokeLeaf(keccak256("r"), keccak256("l")); assertTrue(r.isLeafRevoked(alice, keccak256("r"), keccak256("l"))); assertFalse(r.isLeafRevoked(bob, keccak256("r"), keccak256("l")));
        vm.prank(alice); r.revokeBatch(keccak256("r")); (,,, bool rv,) = r.batch(alice, keccak256("r")); assertTrue(rv); (,,, bool rv2,) = r.batch(bob, keccak256("r")); assertFalse(rv2);
        vm.prank(bob); vm.expectRevert(CertRegistryV2.UnknownBatch.selector); r.revokeBatch(keccak256("nope"));
    }
    function test_same_read_interface_as_v1() public {
        _pub(alice, keccak256("r"), 3, 0);
        (bool ok, bytes memory out) = address(r).staticcall(abi.encodeWithSelector(CertRegistry.batch.selector, alice, keccak256("r"))); assertTrue(ok);
        (address iss,, uint32 c,,) = abi.decode(out, (address, uint64, uint32, bool, string)); assertEq(iss, alice); assertEq(c, 3);
        (ok,) = address(r).staticcall(abi.encodeWithSelector(CertRegistry.isLeafRevoked.selector, alice, keccak256("r"), keccak256("l"))); assertTrue(ok);
    }

    // ---------- verified issuers ----------
    function test_verification_is_escrowed_until_approved() public {
        vm.prank(alice); r.requestVerification{value: VFEE}("Acme Bootcamp", "https://acme.example"); assertEq(r.pendingTotal(), VFEE); assertEq(r.totalFees(), 0, "not earned yet"); _balanceEquation();
        vm.expectRevert(CertRegistryV2.NothingToWithdraw.selector); r.withdraw();                     // escrow is untouchable
        r.approveVerification(alice, uint64(block.timestamp + 365 days));
        (string memory n,, uint64 until, bool ok) = r.issuerInfo(alice); assertEq(n, "Acme Bootcamp"); assertTrue(ok); assertEq(until, block.timestamp + 365 days);
        assertEq(r.pendingTotal(), 0); assertEq(r.totalFees(), VFEE); assertEq(r.feesFromVerification(), VFEE); assertEq(r.verifiedCount(), 1); _balanceEquation();
        r.withdraw(); assertEq(treasury.balance, VFEE);
    }
    function test_rejected_review_refunds_in_full_and_cannot_be_withdrawn_by_the_owner() public {
        vm.prank(alice); r.requestVerification{value: VFEE}("Fake Org", "x"); r.rejectVerification(alice);
        assertEq(r.refundable(alice), VFEE); vm.expectRevert(CertRegistryV2.NothingToWithdraw.selector); r.withdraw();
        uint256 b0 = alice.balance; vm.prank(alice); r.claimRefund(); assertEq(alice.balance - b0, VFEE); assertEq(r.totalFees(), 0); _balanceEquation();
        vm.prank(alice); vm.expectRevert(CertRegistryV2.NothingToClaim.selector); r.claimRefund();
        (,,, bool ok) = r.issuerInfo(alice); assertFalse(ok);
    }
    function test_an_issuer_can_cancel_their_own_undecided_request() public {
        vm.prank(alice); r.requestVerification{value: VFEE}("Org", "u"); vm.prank(alice); r.cancelVerification(); assertEq(r.refundable(alice), VFEE); assertEq(r.pendingTotal(), 0);
        vm.prank(alice); vm.expectRevert(CertRegistryV2.NoPendingReview.selector); r.cancelVerification();
    }
    function test_review_rules() public {
        vm.prank(alice); vm.expectRevert(CertRegistryV2.BadParam.selector); r.requestVerification{value: VFEE}("", "u");
        vm.prank(alice); vm.expectRevert(abi.encodeWithSelector(CertRegistryV2.InsufficientFee.selector, VFEE)); r.requestVerification{value: VFEE - 1}("Org", "u");
        vm.prank(alice); r.requestVerification{value: VFEE}("Org", "u");
        vm.prank(alice); vm.expectRevert(CertRegistryV2.ReviewAlreadyPending.selector); r.requestVerification{value: VFEE}("Org2", "u");
        vm.prank(bob); vm.expectRevert(CertRegistryV2.NotOwner.selector); r.approveVerification(alice, uint64(block.timestamp + 1 days));
        vm.expectRevert(CertRegistryV2.BadParam.selector); r.approveVerification(alice, uint64(block.timestamp));                       // already expired
        vm.expectRevert(CertRegistryV2.BadParam.selector); r.approveVerification(alice, uint64(block.timestamp + 6 * 365 days));           // too long
        vm.expectRevert(CertRegistryV2.NoPendingReview.selector); r.approveVerification(bob, uint64(block.timestamp + 1 days));
    }
    function test_verification_expires_and_can_be_renewed_or_revoked() public {
        vm.prank(alice); r.requestVerification{value: VFEE}("Org", "u"); r.approveVerification(alice, uint64(block.timestamp + 100 days));
        vm.warp(block.timestamp + 101 days); (,,, bool ok) = r.issuerInfo(alice); assertFalse(ok, "expired");
        vm.prank(alice); r.requestVerification{value: VFEE}("Org", "u"); r.approveVerification(alice, uint64(block.timestamp + 365 days)); (,,, ok) = r.issuerInfo(alice); assertTrue(ok); assertEq(r.verifiedCount(), 1, "renewal is not a new verified issuer");
        r.revokeVerification(alice); (,,, ok) = r.issuerInfo(alice); assertFalse(ok);
    }

    // ---------- money out, admin, safety ----------
    function test_withdraw_sends_only_earned_money_to_the_treasury_and_anyone_can_trigger() public {
        _pub(alice, keccak256("a"), 125, 100 * PRICE); vm.prank(bob); r.requestVerification{value: VFEE}("B", "u");          // earned 100*PRICE, escrowed 1 ether
        vm.prank(sponsor); r.withdraw(); assertEq(treasury.balance, 100 * PRICE); assertEq(r.totalWithdrawn(), 100 * PRICE); assertEq(address(r).balance, VFEE); _balanceEquation();
        vm.expectRevert(CertRegistryV2.NothingToWithdraw.selector); r.withdraw();
    }
    function test_admin_is_owner_only_and_capped() public {
        vm.prank(alice); vm.expectRevert(CertRegistryV2.NotOwner.selector); r.setPricing(1, 1, 1);
        vm.expectRevert(CertRegistryV2.BadParam.selector); r.setPricing(0.01 ether + 1, 25, VFEE);
        vm.expectRevert(CertRegistryV2.BadParam.selector); r.setPricing(PRICE, 1001, VFEE);
        vm.expectRevert(CertRegistryV2.BadParam.selector); r.setPricing(PRICE, 25, 10 ether + 1);
        r.setPricing(2 * PRICE, 50, 2 ether); assertEq(r.pricePerCert(), 2 * PRICE); assertEq(r.freeCerts(), 50);
        vm.prank(alice); vm.expectRevert(CertRegistryV2.NotOwner.selector); r.setTreasury(alice);
        vm.expectRevert(CertRegistryV2.BadParam.selector); r.setTreasury(address(0)); r.setTreasury(alice); assertEq(r.treasury(), alice);
    }
    function test_ownership_transfer_is_two_step() public {
        r.transferOwnership(alice); assertEq(r.owner(), owner); vm.prank(bob); vm.expectRevert(CertRegistryV2.NotOwner.selector); r.acceptOwnership();
        vm.prank(alice); r.acceptOwnership(); assertEq(r.owner(), alice); vm.expectRevert(CertRegistryV2.NotOwner.selector); r.setPricing(1, 1, 1);
    }
    function test_constructor_rejects_bad_settings() public {
        vm.expectRevert(CertRegistryV2.BadParam.selector); new CertRegistryV2(address(0), PRICE, 25, VFEE);
        vm.expectRevert(CertRegistryV2.BadParam.selector); new CertRegistryV2(treasury, 0.01 ether + 1, 25, VFEE);
        vm.expectRevert(CertRegistryV2.BadParam.selector); new CertRegistryV2(treasury, PRICE, 1001, VFEE);
        vm.expectRevert(CertRegistryV2.BadParam.selector); new CertRegistryV2(treasury, PRICE, 25, 10 ether + 1);
        CertRegistryV2 ok = new CertRegistryV2(treasury, 0.01 ether, 1000, 10 ether); assertEq(ok.owner(), address(this)); assertEq(ok.treasury(), treasury);
    }
    function test_totals_and_stats() public {
        _pub(alice, keccak256("a"), 40, 15 * PRICE); _pub(bob, keccak256("b"), 10, 0); _pub(alice, keccak256("c"), 5, 5 * PRICE);
        (uint256 fees, uint256 batches, uint256 certs, uint256 issuers, uint256 verified,, uint256 bal) = r.stats();
        assertEq(batches, 3); assertEq(certs, 55); assertEq(issuers, 2); assertEq(verified, 0); assertEq(fees, 20 * PRICE); assertEq(bal, 20 * PRICE);
    }
    function test_plain_transfers_are_rejected() public { (bool ok,) = address(r).call{value: 1}(""); assertFalse(ok); }
    function test_a_refund_recipient_cannot_re_enter() public {
        Greedy g = new Greedy(r); vm.deal(address(g), 10 ether);
        for (uint8 m = 1; m <= 3; m++) { vm.expectRevert(CertRegistryV2.TransferFailed.selector); g.go{value: 1 ether}(m, keccak256(abi.encode("g", m)), 5); }   // re-entering fails, so the whole tx reverts
        assertEq(r.totalBatches(), 0); assertEq(address(r).balance, 0);
    }
    function test_a_recipient_that_rejects_money_only_hurts_itself() public {
        Rejecter x = new Rejecter(); vm.deal(address(x), 5 ether);
        vm.prank(address(x)); vm.expectRevert(CertRegistryV2.TransferFailed.selector); r.publish{value: 1 ether}(keccak256("x"), 5, "L");
        _pub(alice, keccak256("ok"), 5, 0); assertEq(r.totalBatches(), 1, "everyone else is unaffected");
        r.setTreasury(address(x)); _pub(alice, keccak256("p"), 30, 10 * PRICE); vm.expectRevert(CertRegistryV2.TransferFailed.selector); r.withdraw();   // alice used 5 free already, so 10 of these 30 are paid
        r.setTreasury(treasury); r.withdraw(); assertEq(treasury.balance, 10 * PRICE, "fixing the treasury unblocks withdrawal");
    }
}
