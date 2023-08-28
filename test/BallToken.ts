import {
    time,
    loadFixture,
  } from "@nomicfoundation/hardhat-toolbox/network-helpers";
  import { anyValue } from "@nomicfoundation/hardhat-chai-matchers/withArgs";
  import { expect } from "chai";
  import { ethers } from "hardhat";
  import { MaxUint256 } from "@ethersproject/constants";


describe("Token Test", function () {


    var decimals = 18;
    var UniswapV2Factory;
    var UniswapV2Router02;
    var BASEToken;
    var WETH9;
    var USDT;
    var UniswapV2Pair;
    var deployer;
    var user1;

    const ONE_GWEI = 1_000_000_000;


    it("deploy", async function () {

        const users = await ethers.getSigners();
        deployer = users[0];
        console.log("deployer         :::::", deployer.address);

        user1 = users[1];
        console.log("user1         :::::", user1.address);


        const WETH9Instance = await ethers.getContractFactory("WETH9");
        WETH9 = await WETH9Instance.deploy();

        const UniswapV2FactoryInstance = await ethers.getContractFactory("UniswapV2Factory");
        UniswapV2Factory = await UniswapV2FactoryInstance.deploy(deployer.address);

        const UniswapV2Router02Instance = await ethers.getContractFactory("UniswapV2Router02");
        UniswapV2Router02 = await UniswapV2Router02Instance.deploy(UniswapV2Factory.target, WETH9.target);

        const UniswapV2PairInstance = await ethers.getContractFactory("UniswapV2Pair");
        UniswapV2Pair = await UniswapV2PairInstance.deploy();

        const TokenInstance = await ethers.getContractFactory("XVPN");
        BASEToken = await TokenInstance.deploy();
        await BASEToken.init(UniswapV2Router02.target);


        console.log("UniswapV2Factory  :::::", UniswapV2Factory.target);
        console.log("UniswapV2Router02 :::::", UniswapV2Router02.target);
        console.log("UniswapV2Pair     :::::", UniswapV2Pair.target);
        console.log("BASEToken         :::::", BASEToken.target);
        console.log("BASE-pair         :::::", await BASEToken.uniswapV2Pair());
        console.log("--------------------compile deployed------------------------");
    });

    //函数调用
    it("transfer token", async function () {
        await BASEToken.transfer(user1.address, 100 * ONE_GWEI);
    });

    it("approve", async function () {
        await BASEToken.approve(UniswapV2Router02.target, MaxUint256.toString());
        await BASEToken.connect(user1).approve(UniswapV2Router02.target, MaxUint256.toString());
    });

    // 除了Owner 都不能添加流动性
    it("addLiquidityUser1Fail", async function () {
        await expect(
            UniswapV2Router02.connect(user1).addLiquidityETH(
                BASEToken.target,
                100 * ONE_GWEI,
                1 * ONE_GWEI,
                1 * ONE_GWEI,
                user1.address,
                Math.floor(Date.now() / 1000) + 100,
                {value: 1 * ONE_GWEI}
            )).to.be.revertedWith("Trading not yet enabled.")
    });

    // Owner 添加流动性
    it("addLiquidityOwner", async function () {
        //INIT_CODE_PAIR_HASH 需要从factory中获取然后修改掉 否则无法调用
        await UniswapV2Router02.addLiquidityETH(
            BASEToken.target,
            100 * ONE_GWEI,
            1 * ONE_GWEI,
            1 * ONE_GWEI,
            deployer.address,
            Math.floor(Date.now() / 1000) + 100,
            {value: 1 * ONE_GWEI}
        );

        const pairAddress = await UniswapV2Factory.getPair(WETH9, BASEToken.target);
        const Pair = UniswapV2Pair.attach(pairAddress);
        const res = await Pair.getReserves();
        console.log(res);

    });

    // 未开始交易其它用户购买失败
    it("swapExactETHForTokensSupportingFeeOnTransferTokens  Buy Failed", async function () {

        const pairAddress = await UniswapV2Factory.getPair(WETH9, BASEToken.target);
        const Pair = UniswapV2Pair.attach(pairAddress);
        const oldres = await Pair.getReserves();
        console.log("oldres---", oldres);

        await expect(
            UniswapV2Router02.connect(user1).swapExactETHForTokensSupportingFeeOnTransferTokens(
                1,
                [WETH9, BASEToken.target],
                user1,
                Math.floor(Date.now() / 1000) + 100,
                {value: 0.001 * ONE_GWEI} 
        )).to.be.revertedWith("UniswapV2: TRANSFER_FAILED")

    });

    // 未开始交易其它用户卖出失败
    it("swapExactTokensForETHSupportingFeeOnTransferTokens  Sell Faild", async function () {

        const pairAddress = await UniswapV2Factory.getPair(WETH9, BASEToken.target);
        const Pair = UniswapV2Pair.attach(pairAddress);

        await expect(
            UniswapV2Router02.connect(user1).swapExactTokensForTokensSupportingFeeOnTransferTokens(
                10 * ONE_GWEI,
                1,
                [BASEToken.target, WETH9],
                user1,
                Math.floor(Date.now() / 1000) + 100
        )).to.be.revertedWith("Trading not yet enabled.");

    });

    // 打开交易开关 其它用户添加流动性成功
    it("addLiquidityUser1", async function () {
        BASEToken.openTrade();
        const baseBalance = 100 * ONE_GWEI;
        const needBalanceArr = await UniswapV2Router02.getAmountsOut(baseBalance, [BASEToken.target, WETH9]);
        const needEthBalance = needBalanceArr[1];
        console.log("needEthBalance  ", needEthBalance);

        await UniswapV2Router02.connect(user1).addLiquidityETH(
            BASEToken.target,
            baseBalance,
            0,
            0,
            user1,
            Math.floor(Date.now() / 1000) + 100,
            {value: needEthBalance}
        );
    });

    //------------- SWAPPING ---------------
    // 打开交易开关 其它用户购买成功
    it("swapExactETHForTokensSupportingFeeOnTransferTokens  Buy", async function () {

        const pairAddress = await UniswapV2Factory.getPair(WETH9, BASEToken.target);
        const Pair = UniswapV2Pair.attach(pairAddress);
        const oldres = await Pair.getReserves();
        console.log("oldres---", oldres);

        await UniswapV2Router02.connect(user1).swapExactETHForTokensSupportingFeeOnTransferTokens(
            1,
            [WETH9, BASEToken.target],
            user1,
            Math.floor(Date.now() / 1000) + 100,
            {value: 0.001 * ONE_GWEI}
        );

        const newres = await Pair.getReserves();

        console.log("newres---", newres);
    });


    // 打开交易开关 其它用户卖出成功
    it("swapExactTokensForETHSupportingFeeOnTransferTokens  Sell", async function () {

        const pairAddress = await UniswapV2Factory.getPair(WETH9, BASEToken.target);
        const Pair = UniswapV2Pair.attach(pairAddress);
        const oldres = await Pair.getReserves();
        console.log("oldres---", oldres);

        await UniswapV2Router02.connect(user1).swapExactTokensForTokensSupportingFeeOnTransferTokens(
            10 * ONE_GWEI,
            1,
            [BASEToken.target, WETH9],
            user1,
            Math.floor(Date.now() / 1000) + 100,
        );

        const newres = await Pair.getReserves();

        console.log("newres---", newres);
    });
});