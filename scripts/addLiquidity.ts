import { ethers } from "hardhat";
const helpers = require("@nomicfoundation/hardhat-toolbox/network-helpers");

// V3 SwapRouter ABI
const ROUTER_ABI = [
  "function exactInputSingle(tuple(address tokenIn, address tokenOut, uint24 fee, address recipient, uint256 deadline, uint256 amountIn, uint256 amountOutMinimum, uint160 sqrtPriceLimitX96)) external returns (uint256 amountOut)",
  "function exactInput(tuple(bytes path, address recipient, uint256 deadline, uint256 amountIn, uint256 amountOutMinimum)) external returns (uint256 amountOut)",
];

// V3 Position Manager ABI
const POSITION_MANAGER_ABI = [
  "function mint(tuple(address token0, address token1, uint24 fee, int24 tickLower, int24 tickUpper, uint256 amount0Desired, uint256 amount1Desired, uint256 amount0Min, uint256 amount1Min, address recipient, uint256 deadline)) external payable returns (uint256 tokenId, uint128 liquidity, uint256 amount0, uint256 amount1)",
  "function positions(uint256 tokenId) external view returns (uint96 nonce, address operator, address token0, address token1, uint24 fee, int24 tickLower, int24 tickUpper, uint128 liquidity, uint256 feeGrowthInside0LastX128, uint256 feeGrowthInside1LastX128, uint128 tokensOwed0, uint128 tokensOwed1)",
];

// Pool ABI for getting current tick
const POOL_ABI = [
  "function slot0() external view returns (uint160 sqrtPriceX96, int24 tick, uint16 observationIndex, uint16 observationCardinality, uint16 observationCardinalityNext, uint8 feeProtocol, bool unlocked)",
];

const main = async () => {
  // Contract addresses
  const USDC = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";
  const USDT = "0xdAC17F958D2ee523a2206206994597C13D831ec7";
  const positionManager = "0xC36442b4a4522E871399CD717aBDD847Ab11FE88";
  const pool = "0xEe4Cf3b78A74aFfa38C6a926282bCd8B5952818d";
  const whale = "0xe9172Daf64b05B26eb18f07aC8d6D723aCB48f99";

  // Impersonate account
  await helpers.impersonateAccount(whale);
  const impersonatedSigner = await ethers.getSigner(whale);

  // Contract instances
  const usdcContract = await ethers.getContractAt("IERC20", USDC);
  const usdtContract = await ethers.getContractAt("IERC20", USDT);
  const poolContract = new ethers.Contract(pool, POOL_ABI, impersonatedSigner);
  const positionManagerContract = new ethers.Contract(
    positionManager,
    POSITION_MANAGER_ABI,
    impersonatedSigner
  );

  // Check initial balances
  const usdcBal = await usdcContract.balanceOf(impersonatedSigner.address);
  const usdtBal = await usdtContract.balanceOf(impersonatedSigner.address);

  console.log(`\n📌 Initial Balances for ${impersonatedSigner.address}`);
  console.log("- USDC Balance:", ethers.formatUnits(usdcBal, 6));
  console.log("- USDT Balance:", ethers.formatUnits(usdtBal, 6));

  // Get current tick from pool
  const { tick } = await poolContract.slot0();
  console.log("\n📊 Current pool tick:", tick);

  // Calculate tick range
  const TICK_SPACING = 60;
  const tickLower =
    Math.floor(Number(tick) / TICK_SPACING) * TICK_SPACING - TICK_SPACING;
  const tickUpper =
    Math.floor(Number(tick) / TICK_SPACING) * TICK_SPACING + TICK_SPACING;

  // Set desired amounts (smaller amounts for testing)
  const amtUSDCDesired = ethers.parseUnits("100", 6);
  const amtUSDTDesired = ethers.parseUnits("100", 6);

  // Set minimum amounts to 99.5% of desired amounts
  const amtUSDCMin = (amtUSDCDesired * 995n) / 1000n;
  const amtUSDTMin = (amtUSDTDesired * 995n) / 1000n;

  console.log("\n📊 Adding Liquidity with:");
  console.log("- USDC Amount:", ethers.formatUnits(amtUSDCDesired, 6));
  console.log("- USDT Amount:", ethers.formatUnits(amtUSDTDesired, 6));
  console.log("- Tick Range:", { tickLower, tickUpper });

  // Reset approvals
  console.log("\n🔑 Resetting approvals...");
  await usdcContract.connect(impersonatedSigner).approve(positionManager, 0);
  await usdtContract.connect(impersonatedSigner).approve(positionManager, 0);

  // New approvals
  console.log("🔑 Setting new approvals...");
  await usdcContract
    .connect(impersonatedSigner)
    .approve(positionManager, amtUSDCDesired);
  await usdtContract
    .connect(impersonatedSigner)
    .approve(positionManager, amtUSDTDesired);

  const deadline = Math.floor(Date.now() / 1000) + 60; // 1 minute

  // Prepare mint parameters
  const params = {
    token0: USDC,
    token1: USDT,
    fee: 3000, // 0.3%
    tickLower,
    tickUpper,
    amount0Desired: amtUSDCDesired,
    amount1Desired: amtUSDTDesired,
    amount0Min: amtUSDCMin,
    amount1Min: amtUSDTMin,
    recipient: impersonatedSigner.address,
    deadline,
  };

  console.log("\n🔃 Adding Liquidity...");

  try {
    const tx = await positionManagerContract
      .connect(impersonatedSigner)
      .mint(params, {
        gasLimit: 1000000,
      });

    console.log("Transaction hash:", tx.hash);
    const receipt = await tx.wait();
    console.log("✅ Liquidity added successfully!");

    // Check final balances
    const usdcBalAfter = await usdcContract.balanceOf(
      impersonatedSigner.address
    );
    const usdtBalAfter = await usdtContract.balanceOf(
      impersonatedSigner.address
    );

    console.log(`\n📌 Final Balances for ${impersonatedSigner.address}`);
    console.log("- USDC Balance:", ethers.formatUnits(usdcBalAfter, 6));
    console.log("- USDT Balance:", ethers.formatUnits(usdtBalAfter, 6));
  } catch (error: any) {
    console.error("\n❌ Transaction failed:");
    console.error("Error message:", error.message);
    if (error.data) {
      console.error("Error data:", error.data);
    }
  }
};

main().catch((error) => {
  console.error("Script execution failed:", error);
  process.exitCode = 1;
});
