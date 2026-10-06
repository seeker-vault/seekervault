const { 
    Connection, 
    Keypair, 
    PublicKey,
    clusterApiUrl, 
    TransactionMessage, 
    VersionedTransaction 
} = require("@solana/web3.js");
const multisig = require("@sqds/multisig");
const fs = require("fs");

function loadKeypair(data) {
    const raw = data.secretKey ? data.secretKey : data;
    return Keypair.fromSecretKey(Uint8Array.from(Object.values(raw)));
}

function extractPda(pdaResult) {
    return Array.isArray(pdaResult) ? pdaResult[0] : pdaResult;
}

async function main() {
    console.log("=== ЗАПУСК С ПРАВИЛЬНЫМ TREASURY PDA ===");

    const connection = new Connection(clusterApiUrl("devnet"), "confirmed");

    const walletData = JSON.parse(fs.readFileSync("wallets.json", "utf-8"));
    const user1 = loadKeypair(walletData.user1);
    const user2 = loadKeypair(walletData.user2);
    const user3 = loadKeypair(walletData.user3);

    console.log("User 1 Public Key:", user1.publicKey.toBase58());

    const createKey = Keypair.generate();

    const multisigPda = extractPda(multisig.getMultisigPda({
        createKey: createKey.publicKey,
    }));

    const vaultPda = extractPda(multisig.getVaultPda({
        multisigPda,
        index: 0,
    }));

    console.log("Адрес Multisig PDA:", multisigPda.toBase58());
    console.log("Адрес Vault (Казначейство):", vaultPda.toBase58());

    const programId = new PublicKey("SQDS4ep65T869zMMBKyuUq6aD6EgTu8psMjkvj52pCf");

    // Формируем инструкцию
    const createInstruction = await multisig.instructions.multisigCreateV2({
        createKey: createKey.publicKey,
        creator: user1.publicKey,
        rentPayer: user1.publicKey,
        multisigPda,
        configAuthority: user1.publicKey,
        timeLock: 0,
        members: [
            { key: user1.publicKey, permissions: multisig.types.Permissions.all() },
            { key: user2.publicKey, permissions: multisig.types.Permissions.all() },
            { key: user3.publicKey, permissions: multisig.types.Permissions.all() },
        ],
        threshold: 2,
        programId,
    });

    // Явно подставляем Treasury PDA на Ключ #1 с правом записи (isWritable: true)
    const treasuryPda = new PublicKey("HM5y4mz3Bt9JY9mr1hkyhnvqxSH4H2u2451j7Hc2dtvK");
    createInstruction.keys[1] = {
        pubkey: treasuryPda,
        isSigner: false,
        isWritable: true,
    };

    console.log("\nПеревірка ключей перед відправкою:");
    createInstruction.keys.forEach((k, idx) => {
        console.log(`Ключ #${idx} (${k.isWritable ? "mut" : "read"}):`, k.pubkey.toBase58());
    });

    const latestBlockhash = await connection.getLatestBlockhash();
    const messageV0 = new TransactionMessage({
        payerKey: user1.publicKey,
        recentBlockhash: latestBlockhash.blockhash,
        instructions: [createInstruction],
    }).compileToV0Message();

    const transaction = new VersionedTransaction(messageV0);
    transaction.sign([user1, createKey]);

    console.log("\nВідправка транзакції в Devnet...");
    const txSignature = await connection.sendTransaction(transaction);
    
    await connection.confirmTransaction({
        signature: txSignature,
        blockhash: latestBlockhash.blockhash,
        lastValidBlockHeight: latestBlockhash.lastValidBlockHeight,
    });

    console.log("\nМультисіг успішно створений");
    console.log("Хещ транзакції:", txSignature);
    console.log("Подивитись в Solana Explorer:", `https://explorer.solana.com/tx/${txSignature}?cluster=devnet`);
}

main().catch((err) => {
    console.error("Помилка при створенні мультисігу:", err);
});