# SeekerVault

**Shared Treasury for Solana Teams**

SeekerVault is a Solana hackathon project for shared team treasury management.

Instead of one person controlling the team's funds, SeekerVault uses multisig approval rules. A team member creates a payment request, other members approve it, and the transaction can be executed only after the required approval threshold is reached.

## Current MVP

- Solana devnet integration
- Squads multisig
- 2-of-3 approval flow
- Transaction proposal creation
- Multiple member approvals
- Execution only after the approval threshold is reached

## Demo flow

1. Create a 2-of-3 multisig treasury
2. Create a payment proposal
3. First member approves
4. Transaction cannot be executed yet
5. Second member approves
6. Transaction can be executed

## Tech stack

- Solana
- Squads Multisig
- JavaScript / Node.js

## Status

Hackathon MVP / proof of concept.

Mobile UI, wallet connection and hardware-backed signing are planned next steps.
