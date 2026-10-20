# pre-req-vault

Turbin3 Q4 2026 Builders Cohort prerequisite, Part 1. The repo is a fork of [ShrinathNR/pre-req-vault](https://github.com/ShrinathNR/pre-req-vault).

This is an Anchor vault program. Each user gets a PDA vault they can deposit SOL into, withdraw from, and close. The `withdraw` instruction was extended to make a **Cross-Program Invocation (CPI)** into the Turbin3 registration program, which records the user's GitHub username on-chain.

## Program overview

| Instruction | What it does | Key accounts |
|---|---|---|
| `initialize` | Creates the user's `VaultState` and stores the bumps of both PDAs | `vault_state` PDA `["state", user]`, `vault` PDA `["vault", vault_state]` |
| `deposit(amount)` | Transfers SOL from the user to the vault (System Program CPI) | `user` (signer), `vault` |
| `withdraw(amount)` | Transfers SOL from the vault to the user (the vault PDA signs with its seeds), **then CPIs into the registration program's `initialize`** with the GitHub username | `vault`, `application_account` PDA `["prereqs", user]` (owned by the registration program), `application_program` |
| `close` | Sends the rest of the vault's SOL to the user and closes `VaultState` | `vault`, `vault_state` |

## The change

[`withdraw.rs`](programs/pre-req-vault/src/instructions/withdraw.rs): after the SOL transfer, `withdraw` builds the `Initialize` CPI accounts, which come from `declare_program!(registration)` and the IDL in [`idls/registration.json`](idls/registration.json), and calls `registration::cpi::initialize`. The user already signed the outer transaction, so their signer privilege carries through to the CPI. The registration program creates and pays for its own `["prereqs", user]` PDA. The username lives in [`constants.rs`](programs/pre-req-vault/src/constants.rs) as `GITHUB_ID`.

## Devnet deployment

| | |
|---|---|
| Vault program (this repo) | [`CSnNzT5768yVdNbaKH2teECCuvEVovUGaxWZtr48Z8Y1`](https://explorer.solana.com/address/CSnNzT5768yVdNbaKH2teECCuvEVovUGaxWZtr48Z8Y1?cluster=devnet) |
| Registration program | [`TRBZyQHB3m68FGeVsqTK39Wm4xejadjVhP5MAZaKWDM`](https://explorer.solana.com/address/TRBZyQHB3m68FGeVsqTK39Wm4xejadjVhP5MAZaKWDM?cluster=devnet) |
| Registration account (`["prereqs", user]`) | [`3Nu7kDHopPtfHF5DK1Yumit54eei7s1UjMQqeAgejefF`](https://explorer.solana.com/address/3Nu7kDHopPtfHF5DK1Yumit54eei7s1UjMQqeAgejefF?cluster=devnet), `github = "Sidharth-Punna"` |
| Withdraw + CPI tx | [`3ZRA4VD6…qL1k`](https://explorer.solana.com/tx/3ZRA4VD6mW4qTjKoSh9R6TbjcVpa2AYp6Z7UouDaEQD1PRt7zmUe53R2FBQ9McqkHCveZokzc7Eq1mWwqgeqbL1k?cluster=devnet) |

Withdraw tx logs show the vault program calling the registration program:

```
Program CSnNzT5768yVdNbaKH2teECCuvEVovUGaxWZtr48Z8Y1 invoke [1]
  Program 11111111111111111111111111111111 invoke [2]          <- SOL vault -> user
  Program TRBZyQHB3m68FGeVsqTK39Wm4xejadjVhP5MAZaKWDM invoke [2] <- registration CPI
    Program 11111111111111111111111111111111 invoke [3]        <- creates ["prereqs", user]
```

## Running it

Requires Rust, Solana CLI, Anchor CLI 1.1.2 (`avm use 1.1.2`), and pnpm.

```bash
pnpm install
anchor build
anchor test            # Anchor.toml targets devnet
```

The registration program only allows **one registration per wallet**, so the withdraw test passes only once per wallet on devnet. To rehearse locally without spending it, clone the registration program into a local validator:

```bash
solana-test-validator --reset \
  --clone-upgradeable-program TRBZyQHB3m68FGeVsqTK39Wm4xejadjVhP5MAZaKWDM --url devnet \
  --deactivate-feature B8JJXCy5amZyWG9r7EnUYLwzXSXTxG7GZ1qZ1qggo83g
anchor test --skip-local-validator --provider.cluster localnet
```

The `--deactivate-feature` flag matters. The local validator turns on SIMD-0500 by default, and that feature rejects SBPF v0 programs, which is what `cargo build-sbf` produces by default. Devnet doesn't have SIMD-0500 turned on, so the flag makes the local validator behave like devnet.
