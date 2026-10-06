const { 
    Connection, 
    Keypair, 
    PublicKey, 
    LAMPORTS_PER_SOL, 
    SystemProgram, 
    TransactionMessage, 
    VersionedTransaction,
    clusterApiUrl 
} = require("@solana/web3.js");
const multisig = require("@sqds/multisig");
const fs = require("fs");

function loadKeypair(data) {
    const raw = data.secretKey ? data.secretKey : data;
    return Keypair.fromSecretKey(Uint8Array.from(Object.values(raw)));
}

async function main() {
    const connection = new Connection(clusterApiUrl("devnet"), "confirmed");

    const walletData = JSON.parse(fs.readFileSync("wallets.json", "utf-8"));
    const user1 = loadKeypair(walletData.user1);
    const user2 = loadKeypair(walletData.user2);

    const multisigPda = new PublicKey("9Vw5qEnHinkpb8UM5G5E3B54C7jQtU3ypXVbRHWb5YMa");
    const vaultPda = new PublicKey("HT2C5EQ6ZwLarKg7Z7dH2wQHjXwmze8c6bu3DBmvUznz");

    console.log("Зчитування стану мультисігу...");
    const multisigAccount = await multisig.accounts.Multisig.fromAccountAddress(
        connection,
        multisigPda
    );

    // Номер нової транзакції = поточний transactionIndex + 1
    const transactionIndex = BigInt(Number(multisigAccount.transactionIndex) + 1);
    console.log(`Порядковий номер транзакції (transactionIndex): ${transactionIndex}`);

    console.log(`Формування пропозиції: переказ 0.05 SOL з Vault на User 2 (${user2.publicKey.toBase58()})...`);

    // Інструкція, яку має виконати Vault
    const transferInstruction = SystemProgram.transfer({
        fromPubkey: vaultPda,
        toPubkey: user2.publicKey,
        lamports: 0.05 * LAMPORTS_PER_SOL,
    });

    // Повідомлення транзакції Vault
    const vaultTransactionMessage = new TransactionMessage({
        payerKey: vaultPda,
        recentBlockhash: (await connection.getLatestBlockhash()).blockhash,
        instructions: [transferInstruction],
    });

    // 1. Інструкція створення Vault Transaction
    const vaultTxInstruction = await multisig.instructions.vaultTransactionCreate({
        multisigPda,
        transactionIndex,
        creator: user1.publicKey,
        vaultIndex: 0,
        ephemeralSigners: 0,
        transactionMessage: vaultTransactionMessage,
    });

    // 2. Інструкція створення Пропозиції (Proposal)
    const proposalInstruction = await multisig.instructions.proposalCreate({
        multisigPda,
        transactionIndex,
        creator: user1.publicKey,
    });

    // 3. Інструкція підтвердження (голос User 1)
    const approveInstruction = await multisig.instructions.proposalApprove({
        multisigPda,
        transactionIndex,
        member: user1.publicKey,
    });

    const latestBlockhash = await connection.getLatestBlockhash();
    const messageV0 = new TransactionMessage({
        payerKey: user1.publicKey,
        recentBlockhash: latestBlockhash.blockhash,
        instructions: [vaultTxInstruction, proposalInstruction, approveInstruction],
    }).compileToV0Message();

    const transaction = new VersionedTransaction(messageV0);
    transaction.sign([user1]);

    console.log("Відправка транзації створення пропозиції...");
    const txSignature = await connection.sendTransaction(transaction);
    
    await connection.confirmTransaction({
        signature: txSignature,
        blockhash: latestBlockhash.blockhash,
        lastValidBlockHeight: latestBlockhash.lastValidBlockHeight,
    });

    console.log("\nПропозицію успішно створено та віддано 1-й голос (User 1)!");
    console.log("Хеш транзакції:", txSignature);
    console.log("Переглянути в Solana Explorer:", `https://explorer.solana.com/tx/${txSignature}?cluster=devnet`);
    console.log(`\nНаступний крок: підписати від імені User 2 та виконати переказ.`);
}

main().catch((err) => {
    console.error("Помилка під час створення пропозиції:", err);
});