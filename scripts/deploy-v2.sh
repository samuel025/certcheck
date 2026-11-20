#!/usr/bin/env bash
# Deploys CertRegistryV2 (paid registry) to X Layer and writes its address into site/cc/config.js as `registryV2`.
#   scripts/deploy-v2.sh preflight   -> read-only: balance, gas estimate, the settings it would use. Spends nothing.
#   scripts/deploy-v2.sh deploy      -> sends ONE transaction (asks for your keystore password). You run this yourself.
# Settings (env, all optional): TREASURY (where earned fees go; default = the deployer), PRICE_WEI, FREE_CERTS, VERIFY_FEE_WEI.
# The owner (deployer) can later change prices within hard caps, approve/reject verified-issuer reviews, and change the treasury. See docs/OWNER.md.
set -euo pipefail
cd "$(dirname "$0")/.."
ACCOUNT="${ACCOUNT:-firsttape}"; RPC="${RPC_URL:-https://rpc.xlayer.tech}"; CHAIN_ID=196
DEPLOYER="${DEPLOYER:-0x0aE117C07A277D74D9326eb4e33013439dC68fD5}"
TREASURY="${TREASURY:-$DEPLOYER}"; PRICE_WEI="${PRICE_WEI:-240000000000000}"; FREE_CERTS="${FREE_CERTS:-25}"; VERIFY_FEE_WEI="${VERIFY_FEE_WEI:-120000000000000000}"
cmd="${1:-preflight}"
[ "$(cast chain-id --rpc-url "$RPC")" = "$CHAIN_ID" ] || { echo "RPC is not X Layer (chain $CHAIN_ID). Refusing."; exit 1; }
[ -f "$HOME/.foundry/keystores/$ACCOUNT" ] || { echo "No keystore '$ACCOUNT'. Create one: cast wallet import $ACCOUNT --interactive"; exit 1; }
(cd contracts && forge build >/dev/null)
BYTECODE="$(cd contracts && forge inspect src/CertRegistryV2.sol:CertRegistryV2 bytecode)"
ARGS="$(cast abi-encode "constructor(address,uint256,uint32,uint256)" "$TREASURY" "$PRICE_WEI" "$FREE_CERTS" "$VERIFY_FEE_WEI")"
GAS="$(cast estimate --from "$DEPLOYER" --rpc-url "$RPC" --create "$BYTECODE" "$ARGS" 2>/dev/null || cast estimate --from "$DEPLOYER" --rpc-url "$RPC" --create "${BYTECODE}${ARGS#0x}")"
PRICE="$(cast gas-price --rpc-url "$RPC")"; COST_WEI="$(python3 -c "print(int($GAS)*int($PRICE))")"; NEED_WEI="$(python3 -c "print(int($COST_WEI*1.5))")"
BAL_WEI="$(cast balance "$DEPLOYER" --rpc-url "$RPC")"
echo "Deployer (owner): $DEPLOYER"; echo "Treasury:         $TREASURY   <- earned fees are withdrawn here. Set TREASURY=0x... to use a different wallet."
echo "Price per cert:   $(cast from-wei "$PRICE_WEI") OKB   (free allowance $FREE_CERTS per issuer per 30 days)"; echo "Verify review fee: $(cast from-wei "$VERIFY_FEE_WEI") OKB"
echo "Balance:          $(cast from-wei "$BAL_WEI") OKB"; echo "Deploy gas:       $GAS at $(cast to-unit "$PRICE" gwei) gwei"; echo "Estimated cost:   $(cast from-wei "$COST_WEI") OKB (with margin $(cast from-wei "$NEED_WEI") OKB)"
if python3 -c "import sys;sys.exit(0 if int($BAL_WEI)>=int($NEED_WEI) else 1)"; then echo "Balance is enough."; ENOUGH=1; else echo "NOT ENOUGH. Send at least $(cast from-wei "$(python3 -c "print(int($NEED_WEI)-int($BAL_WEI))")") OKB more to $DEPLOYER on X Layer."; ENOUGH=0; fi
[ "$cmd" = "preflight" ] && exit 0
[ "$ENOUGH" = 1 ] || exit 1
echo; echo "Deploying (you will be asked for the keystore password)…"
OUT="$(cd contracts && forge create src/CertRegistryV2.sol:CertRegistryV2 --rpc-url "$RPC" --account "$ACCOUNT" --broadcast --constructor-args "$TREASURY" "$PRICE_WEI" "$FREE_CERTS" "$VERIFY_FEE_WEI")"
echo "$OUT"; REG="$(echo "$OUT" | sed -n 's/^Deployed to: \(0x[0-9a-fA-F]\{40\}\).*/\1/p')"; [ -n "$REG" ] || { echo "Could not read the deployed address."; exit 1; }
sed -i "s|registryV2: \"0x[0-9a-fA-F]*\"|registryV2: \"$REG\"|" site/cc/config.js
echo "RegistryV2: $REG  (written to site/cc/config.js)"; echo "Explorer:   https://www.oklink.com/xlayer/address/$REG"
echo "Next: node scripts/bundle.js   (rebuilds dist/index.html with paid publishing switched on)"
