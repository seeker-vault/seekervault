const { 
    Connection, 
    Keypair, 
    PublicKey, 
    LAMPORTS_PER_SOL, 
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
    console.log("=== ЗАПУСК СКРИПТА ВИКОНАННЯ (ПЛАТНИК: USER 1) ===");

    const connection = new Connection(clusterApiUrl("devnet"), "confirmed");

    const walletData = JSON.parse(fs.readFileSync("wallets.json", "utf-8"));
    const user1 = loadKeypair(walletData.user1);
    const user2 = loadKeypair(walletData.user2);

    const multisigPda = new PublicKey("9Vw5qEnHinkpb8UM5G5E3B54C7jQtU3ypXVbRHWb5YMa");
    const vaultPda = new PublicKey("HT2C5EQ6ZwLarKg7Z7dH2wQHjXwmze8c6bu3DBmvUznz");
    const transactionIndex = 1n;

    console.log(`Підписання (User 2) та виконання транзакції #${transactionIndex}...`);

    // 1. Інструкція підтвердження (голос User 2)
    const approveInstruction = await multisig.instructions.proposalApprove({
        multisigPda,
        transactionIndex,
        member: user2.publicKey,
    });

    // 2. Інструкція виконання
    const executeResult = await multisig.instructions.vaultTransactionExecute({
        connection,
        multisigPda,
        transactionIndex,
        member: user2.publicKey,
    });

    const executeInstruction = executeResult.instruction || executeResult;
    const instructions = [approveInstruction, executeInstruction];

    const latestBlockhash = await connection.getLatestBlockhash();
    
    // User 1 виступає платником комісії (payerKey), User 2 — підписантом пропозиції
    const messageV0 = new TransactionMessage({
        payerKey: user1.publicKey,
        recentBlockhash: latestBlockhash.blockhash,
        instructions: instructions,
    }).compileToV0Message();

    const transaction = new VersionedTransaction(messageV0);
    
    // Транзакцію підписують і User 1 (платить за газ), і User 2 (дає другий голос)
    transaction.sign([user1, user2]);

    console.log("Відправка транзакції підписання та виконання в Devnet...");
    const txSignature = await connection.sendTransaction(transaction);
    
    await connection.confirmTransaction({
        signature: txSignature,
        blockhash: latestBlockhash.blockhash,
        lastValidBlockHeight: latestBlockhash.lastValidBlockHeight,
    });

    console.log("\nТранзакцію успішно затверджено та виконано!");
    console.log("Хеш транзакції:", txSignature);
    console.log("Переглянути в Solana Explorer:", `https://explorer.solana.com/tx/${txSignature}?cluster=devnet`);

    // Перевірка оновлених балансів
    const vaultBalance = await connection.getBalance(vaultPda);
    const user2Balance = await connection.getBalance(user2.publicKey);

    console.log(`\nНовий баланс Vault: ${vaultBalance / LAMPORTS_PER_SOL} SOL`);
    console.log(`Новий баланс User 2: ${user2Balance / LAMPORTS_PER_SOL} SOL`);
}

main().catch((err) => {
    console.error("Помилка під час виконання транзакції:", err);
});