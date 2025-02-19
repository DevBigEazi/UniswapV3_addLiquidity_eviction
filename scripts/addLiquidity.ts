import { ethers } from "hardhat";
const helpers = require("@nomicfoundation/hardhat-toolbox/network-helpers");

const POSITION_MANAGER_ABI = [
  "function mint(tuple(address token0, address token1, uint24 fee, int24 tickLower, int24 tickUpper, uint256 amount0Desired, uint256 amount1Desired, uint256 amount0Min, uint256 amount1Min, address recipient, uint256 deadline)) external payable returns (uint256 tokenId, uint128 liquidity, uint256 amount0, uint256 amount1)",
];

const POOL_ABI = [
  "function slot0() external view returns (uint160 sqrtPriceX96, int24 tick, uint16 observationIndex, uint16 observationCardinality, uint16 observationCardinalityNext, uint8 feeProtocol, bool unlocked)",
  "function token0() external view returns (address)",
  "function token1() external view returns (address)",
];

const main = async () => {
  const USDC = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";
  const USDT = "0xdAC17F958D2ee523a2206206994597C13D831ec7";
  const positionManager = "0xC36442b4a4522E871399CD717aBDD847Ab11FE88";
  const pool = "0xEe4Cf3b78A74aFfa38C6a926282bCd8B5952818d";
  const whale = "0xe9172Daf64b05B26eb18f07aC8d6D723aCB48f99";

  await helpers.impersonateAccount(whale);
  const impersonatedSigner = await ethers.getSigner(whale);

  const poolContract = new ethers.Contract(pool, POOL_ABI, impersonatedSigner);
  const positionManagerContract = new ethers.Contract(
    positionManager,
    POSITION_MANAGER_ABI,
    impersonatedSigner
  );

  // Get token ordering from pool
  const token0Address = await poolContract.token0();
  const token1Address = await poolContract.token1();
  console.log("\n📊 Pool Info:");
  console.log("- Token0:", token0Address);
  console.log("- Token1:", token1Address);

  // Get current tick
  const { tick } = await poolContract.slot0();
  console.log("- Current tick:", tick);

  // Connect to tokens based on pool ordering
  const token0Contract = await ethers.getContractAt("IERC20", token0Address);
  const token1Contract = await ethers.getContractAt("IERC20", token1Address);

  // Check initial balances
  const token0Bal = await token0Contract.balanceOf(impersonatedSigner.address);
  const token1Bal = await token1Contract.balanceOf(impersonatedSigner.address);

  console.log(`\n📌 Initial Balances for ${impersonatedSigner.address}`);
  console.log("- Token0 Balance:", ethers.formatUnits(token0Bal, 6));
  console.log("- Token1 Balance:", ethers.formatUnits(token1Bal, 6));

  // Calculate tick range
  const TICK_SPACING = 60;
  const tickLower =
    Math.floor(Number(tick) / TICK_SPACING) * TICK_SPACING - TICK_SPACING;
  const tickUpper =
    Math.floor(Number(tick) / TICK_SPACING) * TICK_SPACING + TICK_SPACING;

  // Set amounts (using same amount for both tokens since they're both stablecoins)
  const amount0Desired = ethers.parseUnits("100", 6); // 100 units of token0
  const amount1Desired = ethers.parseUnits("100", 6); // 100 units of token1

  console.log("\n📊 Adding Liquidity with:");
  console.log("- Token0 Amount:", ethers.formatUnits(amount0Desired, 6));
  console.log("- Token1 Amount:", ethers.formatUnits(amount1Desired, 6));
  console.log("- Tick Range:", { tickLower, tickUpper });

  // Reset approvals
  console.log("\n🔑 Resetting approvals...");
  await token0Contract.connect(impersonatedSigner).approve(positionManager, 0);
  await token1Contract.connect(impersonatedSigner).approve(positionManager, 0);

  // New approvals
  console.log("🔑 Setting new approvals...");
  await token0Contract
    .connect(impersonatedSigner)
    .approve(positionManager, amount0Desired);
  await token1Contract
    .connect(impersonatedSigner)
    .approve(positionManager, amount1Desired);

  const deadline = Math.floor(Date.now() / 1000) + 60; // 1 minute

  // Prepare mint parameters
  const params = {
    token0: token0Address,
    token1: token1Address,
    fee: 3000,
    tickLower,
    tickUpper,
    amount0Desired,
    amount1Desired,
    amount0Min: 0,
    amount1Min: 0,
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
    const token0BalAfter = await token0Contract.balanceOf(
      impersonatedSigner.address
    );
    const token1BalAfter = await token1Contract.balanceOf(
      impersonatedSigner.address
    );

    console.log(`\n📌 Final Balances for ${impersonatedSigner.address}`);
    console.log("- Token0 Balance:", ethers.formatUnits(token0BalAfter, 6));
    console.log("- Token1 Balance:", ethers.formatUnits(token1BalAfter, 6));
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
