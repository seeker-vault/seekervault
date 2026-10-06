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
    console.log("=== ГОЛОВНИЙ ТЕСТ МУЛЬТИСІГУ SQUADS V4 ===\n");

    const connection = new Connection(clusterApiUrl("devnet"), "confirmed");

    const walletData = JSON.parse(fs.readFileSync("wallets.json", "utf-8"));
    const user1 = loadKeypair(walletData.user1);
    const user2 = loadKeypair(walletData.user2);

    const multisigPda = new PublicKey("9Vw5qEnHinkpb8UM5G5E3B54C7jQtU3ypXVbRHWb5YMa");
    const vaultPda = new PublicKey("HT2C5EQ6ZwLarKg7Z7dH2wQHjXwmze8c6bu3DBmvUznz");

    // 1. Зчитуємо поточний стан мультисігу для отримання наступного transactionIndex
    const multisigAccount = await multisig.accounts.Multisig.fromAccountAddress(
        connection,
        multisigPda
    );
    const transactionIndex = BigInt(Number(multisigAccount.transactionIndex) + 1);

    console.log(`1. Створення пропозиції №${transactionIndex} від User 1 (переказ 0.01 SOL)...`);

    const transferIx = SystemProgram.transfer({
        fromPubkey: vaultPda,
        toPubkey: user2.publicKey,
        lamports: 0.01 * LAMPORTS_PER_SOL,
    });

    const vaultTxMessage = new TransactionMessage({
        payerKey: vaultPda,
        recentBlockhash: (await connection.getLatestBlockhash()).blockhash,
        instructions: [transferIx],
    });

    const vaultTxInstruction = await multisig.instructions.vaultTransactionCreate({
        multisigPda,
        transactionIndex,
        creator: user1.publicKey,
        vaultIndex: 0,
        ephemeralSigners: 0,
        transactionMessage: vaultTxMessage,
    });

    const proposalInstruction = await multisig.instructions.proposalCreate({
        multisigPda,
        transactionIndex,
        creator: user1.publicKey,
    });

    // Одразу додаємо 1-й голос від User 1
    const approveUser1 = await multisig.instructions.proposalApprove({
        multisigPda,
        transactionIndex,
        member: user1.publicKey,
    });

    let blockhash = await connection.getLatestBlockhash();
    let message = new TransactionMessage({
        payerKey: user1.publicKey,
        recentBlockhash: blockhash.blockhash,
        instructions: [vaultTxInstruction, proposalInstruction, approveUser1],
    }).compileToV0Message();

    let tx = new VersionedTransaction(message);
    tx.sign([user1]);
    await connection.confirmTransaction(await connection.sendTransaction(tx));
    console.log("   Пропозицію створено. Кількість підтверджень: 1 / 2");

    // 2. Спроба виконати транзакцію ЛЕШЕ з 1 підтвердженням (очікуємо відмову)
    console.log("\n2. Перевірка обмеження: спроба виконання з 1 підтвердженням...");
    try {
        const executeResult = await multisig.instructions.vaultTransactionExecute({
            connection,
            multisigPda,
            transactionIndex,
            member: user1.publicKey,
        });

        blockhash = await connection.getLatestBlockhash();
        message = new TransactionMessage({
            payerKey: user1.publicKey,
            recentBlockhash: blockhash.blockhash,
            instructions: [executeResult.instruction || executeResult],
        }).compileToV0Message();

        tx = new VersionedTransaction(message);
        tx.sign([user1]);
        await connection.sendTransaction(tx);
        console.error("❌ ПОМИЛКА: Транзакція виконана без потрібної кількості підтверджень!");
    } catch (err) {
        console.log("   УСПІХ: Смарт-контракт відхилив виконання (недостатньо підтверджень)!");
    }

    // 3. Другий користувач підтверджує
    console.log("\n3. Другий користувач (User 2) надає підтвердження...");
    const approveUser2 = await multisig.instructions.proposalApprove({
        multisigPda,
        transactionIndex,
        member: user2.publicKey,
    });

    blockhash = await connection.getLatestBlockhash();
    message = new TransactionMessage({
        payerKey: user1.publicKey,
        recentBlockhash: blockhash.blockhash,
        instructions: [approveUser2],
    }).compileToV0Message();

    tx = new VersionedTransaction(message);
    tx.sign([user1, user2]);
    await connection.confirmTransaction(await connection.sendTransaction(tx));
    console.log("   Підтвердження успішно додано. Кількість підтверджень: 2 / 2");

    // 4. Виконання транзакції після 2-х підтверджень
    console.log("\n4. Виконання транзакції після отримання всіх approvals...");
    const executeResult = await multisig.instructions.vaultTransactionExecute({
        connection,
        multisigPda,
        transactionIndex,
        member: user1.publicKey,
    });

    blockhash = await connection.getLatestBlockhash();
    message = new TransactionMessage({
        payerKey: user1.publicKey,
        recentBlockhash: blockhash.blockhash,
        instructions: [executeResult.instruction || executeResult],
    }).compileToV0Message();

    tx = new VersionedTransaction(message);
    tx.sign([user1]);
    const finalTxSig = await connection.sendTransaction(tx);
    await connection.confirmTransaction(finalTxSig);

    console.log("\n ТЕСТ УСПІШНО ПРОЙДЕНО!");
    console.log("Хеш виконання:", finalTxSig);
    console.log("Explorer:", `https://explorer.solana.com/tx/${finalTxSig}?cluster=devnet`);
}

main().catch((err) => {
    console.error("Помилка під час тесту:", err);
});