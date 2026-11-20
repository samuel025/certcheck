#!/usr/bin/env bash
# Deploys CertRegistry to X Layer and writes the address into site/config.js.
#   scripts/deploy.sh preflight   -> read-only: balance, gas estimate, what is missing. Spends nothing.
#   scripts/deploy.sh deploy      -> sends ONE transaction (asks for your keystore password). You run this yourself.
# Needs: foundry (forge, cast), a Foundry keystore account (default name: firsttape).
set -euo pipefail
cd "$(dirname "$0")/.."
ACCOUNT="${ACCOUNT:-firsttape}"; RPC="${RPC_URL:-https://rpc.xlayer.tech}"; CHAIN_ID=196
cmd="${1:-preflight}"
[ "$(cast chain-id --rpc-url "$RPC")" = "$CHAIN_ID" ] || { echo "RPC is not X Layer (chain $CHAIN_ID). Refusing."; exit 1; }
# A Foundry keystore does not store its address, so read-only checks use DEPLOYER (default: the FirstTape deployer).
ADDR="${DEPLOYER:-0x0aE117C07A277D74D9326eb4e33013439dC68fD5}"
[ -f "$HOME/.foundry/keystores/$ACCOUNT" ] || { echo "No keystore '$ACCOUNT'. Create one: cast wallet import $ACCOUNT --interactive"; exit 1; }
BAL_WEI="$(cast balance "$ADDR" --rpc-url "$RPC")"
BYTECODE="$(cd contracts && forge inspect src/CertRegistry.sol:CertRegistry bytecode)"
GAS="$(cast estimate --from "$ADDR" --rpc-url "$RPC" --create "$BYTECODE")"
PRICE="$(cast gas-price --rpc-url "$RPC")"
COST_WEI="$(python3 -c "print(int($GAS)*int($PRICE))")"
NEED_WEI="$(python3 -c "print(int($COST_WEI*1.5))")"     # 50% safety margin
echo "Deployer:        $ADDR"
echo "Balance:         $(cast from-wei "$BAL_WEI") OKB"
echo "Deploy gas:      $GAS  x  gas price $(cast to-unit "$PRICE" gwei) gwei"
echo "Estimated cost:  $(cast from-wei "$COST_WEI") OKB   (with margin: $(cast from-wei "$NEED_WEI") OKB)"
if python3 -c "import sys;sys.exit(0 if int($BAL_WEI)>=int($NEED_WEI) else 1)"; then echo "Balance is enough."; ENOUGH=1; else echo "NOT ENOUGH. Send at least $(cast from-wei "$(python3 -c "print(int($NEED_WEI)-int($BAL_WEI))")") OKB more to $ADDR on X Layer."; ENOUGH=0; fi
[ "$cmd" = "preflight" ] && exit 0
[ "$ENOUGH" = 1 ] || exit 1
echo; echo "Deploying (you will be asked for the keystore password)…"
OUT="$(cd contracts && forge create src/CertRegistry.sol:CertRegistry --rpc-url "$RPC" --account "$ACCOUNT" --broadcast)"
echo "$OUT"
REG="$(echo "$OUT" | sed -n 's/^Deployed to: \(0x[0-9a-fA-F]\{40\}\).*/\1/p')"
[ -n "$REG" ] || { echo "Could not read the deployed address."; exit 1; }
sed -i "s|registry: \"0x[0-9a-fA-F]*\"|registry: \"$REG\"|" site/config.js
echo "Registry: $REG  (written to site/config.js)"
echo "Explorer: https://www.oklink.com/xlayer/address/$REG"
echo "Next: node scripts/bundle.js   (builds dist/index.html)"
