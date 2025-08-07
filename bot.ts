
const readline = require('readline');
import * as stellarSDK from 'stellar-sdk'
import * as bip39 from 'bip39';
import { derivePath } from 'ed25519-hd-key';

const t = Date.now();
const UNLOCK_TIME_STRING = "2025-05-17 17:16:00"
const DUMMY_BUFFER_SECONDS = 10;
const PRESIGN_BUFFER_SECONDS = 0.5;
const TOTAL_DUMMIES = 5;
const MAX_REAL_TXS = 1;
const HORIZON_MAIN_URL = "https://api.mainnet.minepi.com"
const HORIZON_TEST_URL = 'https://api.testnet.minepi.com';
const MNEMONIC = process.env.MNEMONIC!;
const RECEIVER_MAIN = process.env.RECEIVER_ADDRESS_MAIN!;
const RECEIVER_TEST = process.env.RECEIVER_ADDRESS!;
const ONTESTNET = false;
const AMOUNT_TO_WITHDRAW = 420;
let TXS: string[] = [];


const seed = bip39.mnemonicToSeedSync(MNEMONIC);
const derivationPath = "m/44'/314159'/0'";
const { key } = derivePath(derivationPath, seed.toString('hex'));
let sourceKeypair = ONTESTNET
  ? stellarSDK.Keypair.fromSecret('SDUIQD6PUFRP3WJHVKQE33DIHYUQGBIJFC4TJIPZOEAFRPQIFZEEF4ID')
  : stellarSDK.Keypair.fromRawEd25519Seed(key);

const server = new stellarSDK.Server(ONTESTNET ? HORIZON_TEST_URL : HORIZON_MAIN_URL);
const account = await server.loadAccount(sourceKeypair.publicKey());

console.log(`${(Date.now() - t) * 0.001} seconds, to setup wallet`);

console.log("\n🚨 Welcome To FriBot.");
console.log(`\n Sender Wallet Address - ${sourceKeypair.publicKey()}`);
console.log(`\n Sender Secret - ${sourceKeypair.secret()}`);

function sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}


function preSignTxs(acct = account, withdrawal_amount = AMOUNT_TO_WITHDRAW) {
    console.log("\n🚨 Started Presigning Transactions.");

    let fee_percent = 2;

    for (let i = 0; i < MAX_REAL_TXS; i++) {
        let fee_factor = withdrawal_amount * 0.01 * (fee_percent * (i + 1));
        let fee = Math.floor(fee_factor * 10_000_000);
        let totalBalance = withdrawal_amount * 1e7;
        let maxSendAmount = (totalBalance - fee) / 1e7;
        const cloneAccount = new stellarSDK.Account(acct.accountId(), (BigInt(acct.sequence) + BigInt(i + 1)).toString());
        const tx = new stellarSDK.TransactionBuilder(cloneAccount, {
            fee: ONTESTNET ? (10000).toString() : fee.toString(),
            networkPassphrase: ONTESTNET ? "Pi Testnet" : "Pi Network",
        })
        .addOperation(stellarSDK.Operation.payment({
            destination: ONTESTNET ? RECEIVER_TEST : RECEIVER_MAIN,
            asset: stellarSDK.Asset.native(),
            amount: (maxSendAmount).toFixed(7),
        }))
        .setTimeout(30)
        .build();

        tx.sign(sourceKeypair);
        TXS.push(tx.toXDR());
    }
}

async function submitPreSignTxs() {
    console.log("\n🚨 Started submitting Transactions.");
    let hash = null;
    await Promise.any(TXS.map(async xdr => {
        try {
            const tx = stellarSDK.TransactionBuilder.fromXDR(
                xdr,
                ONTESTNET ? "Pi Testnet" : "Pi Network"
            );
            return await server.submitTransaction(tx);
        } catch (err) {
            return Promise.reject(err);
        }
    })).then(res => {
        console.log("✅ One TX sent successfully: ", res.hash);
        hash = res.hash;
    }).catch(err => {
        if (err.response?.data?.extras?.result_codes) {
        console.log("⛔ Horizon TX result codes:", err.response.data.extras.result_codes);
        } else {
            console.log(err);
            console.error("⛔ TX error (raw):", JSON.stringify(err.response?.data || err, null, 2));
        }
    });

    TXS = [];
    return hash != null;
}

function formatCountdown(ms: number) {
  const totalSec = Math.floor(ms / 1000);
  const min = String(Math.floor(totalSec / 60)).padStart(2, '0');
  const sec = String(totalSec % 60).padStart(2, '0');
  return `${min}:${sec}`;
}


async function submitFinalTransactions(withdrawal_amount = AMOUNT_TO_WITHDRAW) {
    console.log("\n🚨 Started Presigning Transactions.");

    let fee_percent = 2;
    let hash = null;

    for (let i = 0; i < MAX_REAL_TXS; i++) {
        let fee_factor = withdrawal_amount * 0.01 * (fee_percent * (i + 1));
        let fee = Math.floor(fee_factor * 10_000_000);
        let totalBalance = withdrawal_amount * 1e7;
        let maxSendAmount = (totalBalance - fee) / 1e7;
        let account = await server.loadAccount(sourceKeypair.publicKey());
        const tx = new stellarSDK.TransactionBuilder(account, {
            fee: ONTESTNET ? (10000).toString() : fee.toString(),
            networkPassphrase: ONTESTNET ? "Pi Testnet" : "Pi Network",
        })
        .addOperation(stellarSDK.Operation.payment({
            destination: ONTESTNET ? RECEIVER_TEST : RECEIVER_MAIN,
            asset: stellarSDK.Asset.native(),
            amount: (maxSendAmount).toFixed(7),
        }))
        .setTimeout(30)
        .build();

        tx.sign(sourceKeypair);
        TXS.push(tx.toXDR());

        server.submitTransaction(tx).then(res => {
            hash = res.hash;
        })
        .catch(err => {
            console.dir(err, { depth: null, colors: true });
        })
    }
    return hash != null;
}


// === MAIN ===
(async () => {
    const unlockTime = new Date(UNLOCK_TIME_STRING);
    const preSignStartTime = new Date(unlockTime.getTime() - PRESIGN_BUFFER_SECONDS * 1000);
    const now = new Date();

    if (now > unlockTime) {
        console.log("❌ Unlock time already passed.");
        // process.exit(1);
    }

    console.log("🚀 Pi Slot-Taking Started");

    // Schedule Presign transaction
    const presignDelay = preSignStartTime.getTime() - Date.now();
    setTimeout(async () => {
        console.log("🚀 Presigning TX");
        preSignTxs();
    }, presignDelay);

})();



let success = false;
let initialBalance = null;
let lastChecked = 0;
const throttle = 100;
let retries = 0;
function getBalance(account: stellarSDK.AccountResponse) {
    if(account) {
        const nativeBalanceEntry = account.balances.find(b => b.asset_type === 'native');
        if(nativeBalanceEntry) {
            return nativeBalanceEntry.balance;
        } else {
            console.log("Native balance not found");
            process.exit(1);
        }
    }
    return '0';
}
async function checkBalanceThrottled() {
    const now = Date.now();
    if (now - lastChecked < throttle) return null;

    lastChecked = now;
    const acct = await server.loadAccount(sourceKeypair.publicKey());
    const bal = getBalance(acct);
    return parseFloat(bal);
}

while(!success  && retries < 500) {
    const current = await checkBalanceThrottled();
    console.log(`Current Balance: ${current}`)
    console.log(`Initial Balance: ${initialBalance}`)
    if (current !== initialBalance) {
        console.log("📉 Balance dropped — Pi likely Unlocked!");
        success = await submitPreSignTxs();
        success = await submitFinalTransactions(Number(current));
        if (!success) {
            const senderAcct = await server.loadAccount(sourceKeypair.publicKey());
            preSignTxs(senderAcct, Number(current));
            retries++;
        }
        initialBalance = current;
    } else {
        console.log(`Pi is not yet unlocked... Still checking`);
    }
    await sleep(100);
}