
export interface IAnalysis {
    startingCapital: number;
    finalCapital: number;
    profit: number;
    profitPct: number;
    growth: number;
    totalTrades: number;
    barCount: number;
    maxDrawdown: number;
    maxDrawdownPct: number;
    maxRiskPct?: number;
    expectency?: number,
    rmultipleStdDev?: number,
    systemQuality?: number;
    profitFactor: number | undefined;
    proportionProfitable: number;
    percentProfitable: number;
    returnOnAccount: number;
    averageProfitPerTrade: number;
    numWinningTrades: number;
    numLosingTrades: number;
    averageWinningTrade: number;
    averageLosingTrade: number;
    expectedValue: number;
}
