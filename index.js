require('dotenv').config();
require('console.table');

const express = require('express');
const path = require('path');
const http = require('http');
const cors = require('cors');
const Web3 = require('web3');
const axios = require('axios');

const ONE_SPLIT_ABI = require('./abis/OneSplit_ABI.json');
const ZRX_EXCHANGE_ABI = require('./abis/Zrx_ABI.json');
const TRADER_ABI = require('./abis/Zrx_ABI.json');
const FILL_ORDER_ABI = require('./abis/FillOrder_ABI.json');

const PORT = process.env.PORT || 5000;;
const app = express();
const server = http.createServer(app).listen(PORT, () => console.log(`Listening on ${ PORT }`));
app.use(express.static(path.join(__dirname, 'public')));
app.use(cors({credentials: true, origin: '*'}));

const web3 = new Web3(process.env.RPC_URL);
web3.eth.accounts.wallet.add(process.env.PRIVATE_KEY);

const ONE_SPLIT_ADDRESS = "0xC586BeF4a0992C495Cf22e1aeEE4E446CECDee0E";
const oneSplitContract = new web3.eth.Contract(ONE_SPLIT_ABI, ONE_SPLIT_ADDRESS);

const ZRX_EXCHANGE_ADDRESS = '0x61935CbDd02287B511119DDb11Aeb42F1593b7Ef';
const zrxExchangeContract = new web3.eth.Contract(ZRX_EXCHANGE_ABI, ZRX_EXCHANGE_ADDRESS);

const TRADER_ADDRESS = process.env.CONTRACT_ADDRESS;
const traderContract = new web3.eth.Contract(TRADER_ABI, TRADER_ADDRESS);

const DAI = 'DAI';
const WETH = 'WETH';

const ASSET_ADDRESSES = {
  DAI: '0x6b175474e89094c44da98b954eedeac495271d0f',
  WETH: '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2'
};

tokensWithDecimalPlaces = (amount, symbol) => {
  amount = amount.toString();
  return web3.utils.fromWei(amount, 'Ether');
}

const displayTokens = (amount, symbol) => {
  let tokens;
  tokens = tokensWithDecimalPlaces(amount, symbol);
  return(tokens);
}

const toTokens = (tokenAmount, symbol) => {
  if (symbol === USDC) {
    return web3.utils.fromWei(web3.utils.toWei(tokenAmount), 'Szabo');
  } else {
    return web3.utils.toWei(tokenAmount, 'Ether');
  }
}

const ONE_SPLIT_PARTS = 10;
const ONE_SPLIT_FLAGS = 0;
async function fetchOneSplitData(args) {
  const { fromToken, toToken, amount } = args;
  const data = await oneSplitContract.methods.getExpectedReturn(fromToken, toToken, amount, ONE_SPLIT_PARTS, ONE_SPLIT_FLAGS).call();
  return(data);
}

const checkedOrders = [];
let profitableArbFound = false;
async function checkArb(args) {
  const { zrxOrder, assetOrder } = args;

  const tempOrderID = JSON.stringify(zrxOrder);

  if(checkedOrders.includes(tempOrderID)) {
    return;
  }

  checkedOrders.push(tempOrderID);

  if(zrxOrder.makerFee.toString() !== '0') {
    console.log('Order has maker fee');
    return;
  }

  if(zrxOrder.takerFee.toString() !== '0') {
    console.log('Order has taker fee');
    return;
  }

  const inputAssetAmount = zrxOrder.takerAssetAmount;

  const orderTuple = [
    zrxOrder.makerAddress,
    zrxOrder.takerAddress,
    zrxOrder.feeRecipientAddress,
    zrxOrder.senderAddress,
    zrxOrder.makerAssetAmount,
    zrxOrder.takerAssetAmount,
    zrxOrder.makerFee,
    zrxOrder.takerFee,
    zrxOrder.expirationTimeSeconds,
    zrxOrder.salt,
    zrxOrder.makerAssetData,
    zrxOrder.takerAssetData,
    zrxOrder.makerFeeAssetData,
    zrxOrder.takerFeeAssetData
  ];

  const orderInfo = await zrxExchangeContract.methods.getOrderInfo(orderTuple).call();

  if(orderInfo.orderTakerAssetFilledAmount.toString() !== '0') {
    return;
  }

  const oneSplitData = await fetchOneSplitData({
    fromToken: ASSET_ADDRESSES[assetOrder[1]],
    toToken: ASSET_ADDRESSES[assetOrder[2]],
    amount: zrxOrder.makerAssetAmount,
  });

  const outputAssetAmount = oneSplitData.returnAmount;

  let estimatedGasFee = process.env.ESTIMATED_GAS.toString() * web3.utils.toWei(process.env.GAS_PRICE.toString(), 'Gwei');
  estimatedGasFee = web3.utils.fromWei(estimatedGasFee.toString(), 'Ether');

  let netProfit = outputAssetAmount - inputAssetAmount - estimatedGasFee;
  netProfit = Math.floor(netProfit);

  const profitable = netProfit.toString() > '0';

  if(profitable) {
    if(profitableArbFound) {
      return;
    }

    profitableArbFound = true;

    console.table([{
      'Profitable?': profitable,
      'Asset Order': assetOrder.join(', '),
      'Exchange Order': 'ZRX, 1Split',
      'Input':  displayTokens(inputAssetAmount, assetOrder[0]).padEnd(22, ' '),
      'Output': displayTokens(outputAssetAmount, assetOrder[0]).padEnd(22, ' '),
      'Profit': displayTokens(netProfit.toString(), assetOrder[0]).padEnd(22, ' '),
      'Timestamp': now(),
    }]);

    await trade(assetOrder[0], ASSET_ADDRESSES[assetOrder[0]], ASSET_ADDRESSES[assetOrder[1]], zrxOrder, inputAssetAmount, oneSplitData);
  }
}

async function trade(flashTokenSymbol, flashTokenAddress, arbTokenAddress, orderJson, fillAmount, oneSplitData) {
  const FLASH_AMOUNT = toTokens('10000', flashTokenSymbol);
  const FROM_AMOUNT = fillAmount;

  const orderTuple = [
    orderJson.makerAddress,
    orderJson.takerAddress,
    orderJson.feeRecipientAddress,
    orderJson.senderAddress,
    orderJson.makerAssetAmount,
    orderJson.takerAssetAmount,
    orderJson.makerFee,
    orderJson.takerFee,
    orderJson.expirationTimeSeconds,
    orderJson.salt,
    orderJson.makerAssetData,
    orderJson.takerAssetData,
    orderJson.makerFeeAssetData,
    orderJson.takerFeeAssetData
  ];

  const takerAssetFillAmount = FROM_AMOUNT;
  const signature = orderJson.signature;
  const data = web3.eth.abi.encodeFunctionCall(FILL_ORDER_ABI, [orderTuple, takerAssetFillAmount, signature]);

  const minReturn = oneSplitData.returnAmount;
  const distribution = oneSplitData.distribution;

  const minReturnWtihSplippage = minReturnWithSlippage = (new web3.utils.BN(minReturn)).mul(new web3.utils.BN('995')).div(new web3.utils.BN('1000')).toString();

  receipt = await traderContract.methods.getFlashloan(
    flashTokenAddress,
    FLASH_AMOUNT,
    arbTokenAddress,
    data,
    minReturnWtihSplippage.toString(),
    distribution,
  ).send({
    from: process.env.ADDRESS,
    gas: process.env.GAS_LIMIT,
    gasPrice: web3.utils.toWei(process.env.GAS_PRICE, 'Gwei')
  });
}

async function checkOrderBook(baseAssetSymbol, quoteAssetSymbol) {
  const baseAssetAddress = ASSET_ADDRESSES[baseAssetSymbol].substring(2,42);
  const quoteAssetAddress = ASSET_ADDRESSES[quoteAssetSymbol].substring(2,42);
  const zrxResponse =
    await axios.get(
      `https://api.0x.org/sra/v3/orderbook?baseAssetData=0xf47261b0000000000000000000000000${baseAssetAddress}&quoteAssetData=0xf47261b0000000000000000000000000${quoteAssetAddress}&perPage=1000`
    );
  zrxResponse.data.bids.records.map((o) => {
    checkArb({
      zrxOrder: o.order,
      assetOrder: [baseAssetSymbol, quoteAssetSymbol, baseAssetSymbol]
    });
  });
}

let checkingMarkets = false;
async function checkMarkets() {
  if(checkingMarkets) {
    return;
  }

  if(profitableArbFound) {
    clearInterval(marketChecker);
  }

  checkingMarkets = true;
  try {
    await checkOrderBook(WETH, DAI);
  } catch (error) {
    console.error(error);
    checkingMarkets = false;
    return;
  }

  checkingMarkets = false;
}

const marketChecker = setInterval(async () => { await checkMarkets() }, 3000);
