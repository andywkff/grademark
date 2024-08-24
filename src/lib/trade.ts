import { TradeDirection } from "./strategy";

export interface ITimestampedValue {
    time: Date;
    value: number;
}

export interface ITrade {
    direction: TradeDirection;
    entryTime: Date;
    entryPrice: number;
    exitTime: Date;
    exitPrice: number;
    profit: number;
    profitPct: number;
    growth: number;
    riskPct?: number;
    rmultiple?: number;
    riskSeries?: ITimestampedValue[];
    holdingPeriod: number;
    exitReason: string;
    stopPrice?: number;
    stopPriceSeries?: ITimestampedValue[];
    profitTarget?: number;

}