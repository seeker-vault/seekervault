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
const fs = require("fs");

function loadKeypair(data) {
    const raw = data.secretKey ? data.secretKey : data;
    return Keypair.fromSecretKey(Uint8Array.from(Object.values(raw)));
}

async function main() {
    const connection = new Connection(clusterApiUrl("devnet"), "confirmed");

    // Завантажуємо ключі User 1
    const walletData = JSON.parse(fs.readFileSync("wallets.json", "utf-8"));
    const user1 = loadKeypair(walletData.user1);

    // Адреса казначейства (Vault PDA)
    const vaultPda = new PublicKey("HT2C5EQ6ZwLarKg7Z7dH2wQHjXwmze8c6bu3DBmvUznz");
    const amountSol = 0.2;

    console.log(`Надсилання ${amountSol} SOL з User 1 (${user1.publicKey.toBase58()}) на Vault (${vaultPda.toBase58()})...`);

    // Інструкція переказу SOL
    const transferInstruction = SystemProgram.transfer({
        fromPubkey: user1.publicKey,
        toPubkey: vaultPda,
        lamports: amountSol * LAMPORTS_PER_SOL,
    });

    const latestBlockhash = await connection.getLatestBlockhash();
    const messageV0 = new TransactionMessage({
        payerKey: user1.publicKey,
        recentBlockhash: latestBlockhash.blockhash,
        instructions: [transferInstruction],
    }).compileToV0Message();

    const transaction = new VersionedTransaction(messageV0);
    transaction.sign([user1]);

    const txSignature = await connection.sendTransaction(transaction);
    await connection.confirmTransaction({
        signature: txSignature,
        blockhash: latestBlockhash.blockhash,
        lastValidBlockHeight: latestBlockhash.lastValidBlockHeight,
    });

    console.log("\nПоповнення казначейства (Vault) успішне!");
    console.log("Хеш транзакції:", txSignature);
    console.log("Переглянути в Solana Explorer:", `https://explorer.solana.com/tx/${txSignature}?cluster=devnet`);

    // Перевірка актуального балансу Vault
    const balance = await connection.getBalance(vaultPda);
    console.log(`Поточний баланс Vault: ${balance / LAMPORTS_PER_SOL} SOL`);
}

main().catch((err) => {
    console.error("Помилка під час поповнення Vault:", err);
});