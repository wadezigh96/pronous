#!/usr/bin/env bash
# Prepares the two special-prize toolchains on YOUR machine.
# This script cannot scan a Binance QR code or mint an ERC-8004 id.
set -euo pipefail

echo "== PRONOUS special-prize setup =="
echo "1) Agentic Wallet skill"
npx --yes skills add binance/binance-skills-hub/skills/binance-web3/binance-agentic-wallet || true
npx --yes skills add binance/binance-skills-hub/skills/binance-web3/binance-tokenized-securities-info || true

echo "2) BNB Agent Studio CLI"
npm install --global @bnbagent/studio-cli || true
command -v bag >/dev/null && bag skills install || echo "bag not on PATH yet; reopen the terminal"

echo
echo "NEXT, only you can do this:"
echo "  A. Di AI / Termux:  Sign in to Binance Agentic Wallet"
echo "     lalu scan QR dengan Binance App"
echo "  B. Di folder baru:  bag init   lalu paste prompt dari agent/AGENT_STUDIO_PROMPT.md"
echo "  C. Deploy testnet:  bag deploy --provider bnb"
echo "  D. Tempel agent URL / ERC-8004 id ke form hackathon"
