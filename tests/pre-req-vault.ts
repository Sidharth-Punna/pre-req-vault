import * as anchor from "@anchor-lang/core";
import { Program } from "@anchor-lang/core";
import { PreReqVault } from "../target/types/pre_req_vault";
import {
  Commitment,
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
} from "@solana/web3.js";
import NodeWallet from "@anchor-lang/core/dist/cjs/nodewallet";
import { BN } from "bn.js";
import { expect } from "chai";

const commitement: Commitment = "confirmed";

describe("pre-req-vault", () => {
  const confirmTx = async (signature: string) => {
    console.log(`Transaction signature: ${signature}`);
    const latestBlockhash = await anchor
      .getProvider()
      .connection.getLatestBlockhash();
    await anchor.getProvider().connection.confirmTransaction(
      {
        signature,
        ...latestBlockhash,
      },
      commitement,
    );
  };

  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.preReqVault as Program<PreReqVault>;
  const user = provider.wallet.publicKey;

  // Derive PDAs

  const [vaultStatePda, stateBump] = PublicKey.findProgramAddressSync(
    [Buffer.from("state"), user.toBuffer()],
    program.programId,
  );

  const [vaultPda, vaultBump] = PublicKey.findProgramAddressSync(
    [Buffer.from("vault"), vaultStatePda.toBuffer()],
    program.programId,
  );

  //   before(async () => {
  //     const sig = await provider.connection.requestAirdrop(
  //       user,
  //       10 * LAMPORTS_PER_SOL,
  //     );
  //     await confirmTx(sig);
  //   });

  it("Initialize the vault", async () => {
    const tx = await program.methods
      .initialize()
      .accountsStrict({
        user: user,
        vaultState: vaultStatePda,
        vault: vaultPda,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    await confirmTx(tx);

    const vaultState = await program.account.vaultState.fetch(vaultStatePda);
    expect(vaultState.vaultBump).to.equal(vaultBump);
    expect(vaultState.stateBump).to.equal(stateBump);
  });

  it(" Deposilt 1 Sol in to the vault", async () => {
    const depositAmount = 1 * LAMPORTS_PER_SOL;

    const initialVaultBalance = await provider.connection.getBalance(vaultPda);
    const intialUserBalance = await provider.connection.getBalance(user);

    const tx = await program.methods
      .deposit(new BN(depositAmount))
      .accountsStrict({
        user: user,
        vaultState: vaultStatePda,
        vault: vaultPda,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    confirmTx(tx);

    const finalBalanceVault = await provider.connection.getBalance(vaultPda);
    const finalBalanceUser = await provider.connection.getBalance(user);

    expect(finalBalanceVault).to.equal(initialVaultBalance + depositAmount);
    expect(finalBalanceUser).to.be.lessThan(intialUserBalance - depositAmount);
  });

  it(" Withdraw 0.5 Sol from the vault", async () => {
    const withdrawAmount = 0.5 * LAMPORTS_PER_SOL;

    const initialVaultBalance = await provider.connection.getBalance(vaultPda);
    const intialUserBalance = await provider.connection.getBalance(user);

    const applicationProgram = new PublicKey(
      "TRBZyQHB3m68FGeVsqTK39Wm4xejadjVhP5MAZaKWDM",
    );

    const applicationAccount = PublicKey.findProgramAddressSync(
      [Buffer.from("prereqs"), user.toBuffer()],
      applicationProgram,
    )[0];

    const tx = await program.methods
      .withdraw(new BN(withdrawAmount))
      .accountsStrict({
        user: user,
        vaultState: vaultStatePda,
        vault: vaultPda,
        systemProgram: SystemProgram.programId,
        applicationAccount,
        applicationProgram,
      })
      .rpc();

    confirmTx(tx);

    const finalBalanceVault = await provider.connection.getBalance(vaultPda);
    const finalBalanceUser = await provider.connection.getBalance(user);

    expect(finalBalanceVault).to.equal(initialVaultBalance - withdrawAmount);
    expect(finalBalanceUser).to.be.greaterThan(intialUserBalance);

    // The CPI should have created the registration account owned by the registration program
    const applicationAccountInfo = await provider.connection.getAccountInfo(
      applicationAccount,
    );
    expect(applicationAccountInfo).to.not.be.null;
    expect(applicationAccountInfo.owner.toBase58()).to.equal(
      applicationProgram.toBase58(),
    );

    // ApplicationAccount layout: discriminator(8) + user(32) + bump(1) + pre_req_ts(1) + pre_req_rs(1) + github(4 + len)
    const githubLen = applicationAccountInfo.data.readUInt32LE(43);
    const github = applicationAccountInfo.data
      .subarray(47, 47 + githubLen)
      .toString();
    console.log(`Registered GitHub username: ${github}`);
  });

  it(" Close the vault and withdraw all the funds", async () => {
    const initialUserBalance = await provider.connection.getBalance(user);

    const tx = await program.methods
      .close()
      .accountsStrict({
        user: user,
        vaultState: vaultStatePda,
        vault: vaultPda,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    confirmTx(tx);

    expect(await provider.connection.getBalance(vaultPda)).to.equal(0);

    const vaultStateInfo = await provider.connection.getAccountInfo(
      vaultStatePda,
    );
    expect(vaultStateInfo).to.be.null;

    const finalUserBalance = await provider.connection.getBalance(user);
    expect(finalUserBalance).to.be.greaterThan(initialUserBalance);
  });
});
