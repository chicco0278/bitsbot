# BitsBot

BitsBot is a node.js app with solidity smart contracts that continuosly fetches crypto prices on exchanges looking for arbitrage opportunities, trying to guarantee that the trade is possible before even attempting to execute it.

## Project Structure

<b>index.js</b> : It's the starting point of node.js app to looking for arbitrage opportunities and execute a trade.

<b>BitsBot.sol</b> : In the contracts folder BitsBot.sol a smart contract gets called by the node app only when a profitable arbitrage is found

## Setup

Deploy BitsBot.sol with an initial 100 wei and get an address

## Environment Setup

### Create .env file and fill the below details

<b>RPC_URL=</b>"https://mainnet.infura.io/v3/YOUR_API_KEY_HERE"</br>
<b>ADDRESS=</b>"0x..."</br>
<b>PRIVATE_KEY=</b>"0x..."</br>
<b>CONTRACT_ADDRESS=</b>"0x..."</b></br>
<b>GAS_LIMIT=</b>3000000</br>
<b>GAS_PRICE=</b>200</br>
<b>ESTIMATED_GAS=</b>1700000</br>

## Run

Run node app by this command => <b>node index.js</b>
