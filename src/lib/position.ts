import { ITimestampedValue } from "./trade";
import { TradeDirection } from "./strategy";

/**
 * Interface that defines an open position.
 */
export interface IPosition {
    direction: TradeDirection;
    entryTime: Date;
    entryPrice: number;
    profit: number;
    profitPct: number;
    growth: number;
    initialUnitRisk?: number;
    initialRiskPct?: number;
    curRiskPct?: number;
    curRMultiple?: number;
    riskSeries?: ITimestampedValue[];
    holdingPeriod: number;
    initialStopPrice?: number;
    curStopPrice?: number;
    stopPriceSeries?: ITimestampedValue[];
    profitTarget?: number;
}