import { DataFrame, IDataFrame } from 'data-forge';
import { IBar } from "./bar.js";
import { IPosition } from "./position.js";
import { IEnterPositionOptions, IStrategy, TradeDirection } from "./strategy";
import { ITrade } from "./trade";
import { assert, isObject } from "./utils";
const CBuffer = require('CBuffer');

function updatePosition(position: IPosition, bar: IBar): void {
    position.profit = bar.close - position.entryPrice;
    position.profitPct = (position.profit / position.entryPrice) * 100;
    position.growth = position.direction === TradeDirection.Long
        ? bar.close / position.entryPrice
        : position.entryPrice / bar.close;
    if (position.curStopPrice !== undefined) {
        const unitRisk = position.direction === TradeDirection.Long
            ? bar.close - position.curStopPrice
            : position.curStopPrice - bar.close;
        position.curRiskPct = (unitRisk / bar.close) * 100;
        position.curRMultiple = position.profit / unitRisk;
    }
    position.holdingPeriod += 1;
}

function finalizePosition(position: IPosition, exitTime: Date, exitPrice: number, exitReason: string): ITrade {
    const profit = position.direction === TradeDirection.Long
        ? exitPrice - position.entryPrice
        : position.entryPrice - exitPrice;
    let rmultiple;
    if (position.initialUnitRisk !== undefined) {
        rmultiple = profit / position.initialUnitRisk;
    }
    return {
        direction: position.direction,
        entryTime: position.entryTime,
        entryPrice: position.entryPrice,
        exitTime: exitTime,
        exitPrice: exitPrice,
        profit: profit,
        profitPct: (profit / position.entryPrice) * 100,
        growth: position.direction === TradeDirection.Long
            ? exitPrice / position.entryPrice
            : position.entryPrice / exitPrice,
        riskPct: position.initialRiskPct,
        riskSeries: position.riskSeries,
        rmultiple: rmultiple,
        holdingPeriod: position.holdingPeriod,
        exitReason: exitReason,
        stopPrice: position.initialStopPrice,
        stopPriceSeries: position.stopPriceSeries,
        profitTarget: position.profitTarget,
    };
}

enum PositionStatus {
    None,
    Enter,
    Position,
    Exit,
}

export interface IBacktestOptions {
    recordStopPrice?: boolean;
    recordRisk?: boolean;
}

export function backtest<InputBarT extends IBar, IndicatorBarT extends InputBarT, ParametersT, IndexT>(
    strategy: IStrategy<InputBarT, IndicatorBarT, ParametersT, IndexT>,
    inputSeries: IDataFrame<IndexT, InputBarT>,
    options?: IBacktestOptions):
    ITrade[] {

    if (!isObject(strategy)) {
        throw new Error("Expected 'strategy' argument to 'backtest' to be an object that defines the trading strategy to backtest.");
    }

    if (!isObject(inputSeries) && inputSeries.count() > 0) {
        throw new Error("Expected 'inputSeries' argument to 'backtest' to be a Data-Forge DataFrame that contains historical input data for backtesting.");
    }

    if (!options) {
        options = {};
    }

    if (inputSeries.none()) {
        throw new Error("Expect input data series to contain at last 1 bar.");
    }

    const lookbackPeriod = strategy.lookbackPeriod || 1;
    if (inputSeries.count() < lookbackPeriod) {
        throw new Error("You have less input data than your lookback period, the size of your input data should be some multiple of your lookback period.");
    }

    const strategyParameters = strategy.parameters || {} as ParametersT;

    let indicatorsSeries: IDataFrame<IndexT, IndicatorBarT>;

    if (strategy.prepIndicators) {
        indicatorsSeries = strategy.prepIndicators({
            parameters: strategyParameters,
            inputSeries: inputSeries
        });
    }
    else {
        indicatorsSeries = inputSeries as IDataFrame<IndexT, IndicatorBarT>;
    }
    const completedTrades: ITrade[] = [];
    let positionStatus: PositionStatus = PositionStatus.None;
    let positionDirection: TradeDirection = TradeDirection.Long;
    let conditionalEntryPrice: number | undefined;
    let openPosition: IPosition | null = null;
    const lookbackBuffer = new CBuffer(lookbackPeriod);
    function enterPosition(options?: IEnterPositionOptions) {
        assert(positionStatus === PositionStatus.None); //"Can only enter a position when not already in one."
        positionStatus = PositionStatus.Enter;
        positionDirection = options && options.direction || TradeDirection.Long;
        conditionalEntryPrice = options && options.entryPrice;
    }
    function exitPosition() {
        assert(positionStatus === PositionStatus.Position); //"Can only exit a position when we are in a position."
        positionStatus = PositionStatus.Exit;
    }
    function closePosition(bar: InputBarT, exitPrice: number, exitReason: string) {
        const trade = finalizePosition(openPosition!, bar.time, exitPrice, exitReason);
        completedTrades.push(trade!);
        openPosition = null;
        positionStatus = PositionStatus.None;
    }

    for (const bar of indicatorsSeries) {
        lookbackBuffer.push(bar);
        if (lookbackBuffer.length < lookbackPeriod) {
            continue;
        }
        switch (+positionStatus) { //TODO: + is a work around for TS switch stmt with enum.
            case PositionStatus.None:
                strategy.entryRule(enterPosition, {
                    bar: bar,
                    lookback: new DataFrame<number, IndicatorBarT>(lookbackBuffer.data),
                    parameters: strategyParameters
                });
                break;

            case PositionStatus.Enter:
                assert(openPosition === null); //"Expected there to be no open position initialised yet!"

                if (conditionalEntryPrice !== undefined) {
                    if (positionDirection === TradeDirection.Long) {
                        if (bar.high < conditionalEntryPrice) {
                            break;
                        }
                    }
                    else {
                        if (bar.low > conditionalEntryPrice) {
                            break;
                        }
                    }
                }
                const entryPrice = bar.open;
                openPosition = {
                    direction: positionDirection,
                    entryTime: bar.time,
                    entryPrice: entryPrice,
                    growth: 1,
                    profit: 0,
                    profitPct: 0,
                    holdingPeriod: 0,
                };

                if (strategy.stopLoss) {
                    const initialStopDistance = strategy.stopLoss({
                        entryPrice: entryPrice,
                        position: openPosition,
                        bar: bar,
                        lookback: new DataFrame<number, InputBarT>(lookbackBuffer.data),
                        parameters: strategyParameters
                    });
                    openPosition.initialStopPrice = openPosition.direction === TradeDirection.Long
                        ? entryPrice - initialStopDistance
                        : entryPrice + initialStopDistance;
                    openPosition.curStopPrice = openPosition.initialStopPrice;
                }

                if (strategy.trailingStopLoss) {
                    const trailingStopDistance = strategy.trailingStopLoss({
                        entryPrice: entryPrice,
                        position: openPosition,
                        bar: bar,
                        lookback: new DataFrame<number, InputBarT>(lookbackBuffer.data),
                        parameters: strategyParameters
                    });
                    const trailingStopPrice = openPosition.direction === TradeDirection.Long
                        ? entryPrice - trailingStopDistance
                        : entryPrice + trailingStopDistance;
                    if (openPosition.initialStopPrice === undefined) {
                        openPosition.initialStopPrice = trailingStopPrice;
                    }
                    else {
                        openPosition.initialStopPrice = openPosition.direction === TradeDirection.Long
                            ? Math.max(openPosition.initialStopPrice, trailingStopPrice)
                            : Math.min(openPosition.initialStopPrice, trailingStopPrice);
                    }

                    openPosition.curStopPrice = openPosition.initialStopPrice;

                    if (options.recordStopPrice) {
                        openPosition.stopPriceSeries = [
                            {
                                time: bar.time,
                                value: openPosition.curStopPrice
                            },
                        ];
                    }
                }

                if (openPosition.curStopPrice !== undefined) {
                    openPosition.initialUnitRisk = openPosition.direction === TradeDirection.Long
                        ? entryPrice - openPosition.curStopPrice
                        : openPosition.curStopPrice - entryPrice;
                    openPosition.initialRiskPct = (openPosition.initialUnitRisk / entryPrice) * 100;
                    openPosition.curRiskPct = openPosition.initialRiskPct;
                    openPosition.curRMultiple = 0;

                    if (options.recordRisk) {
                        openPosition.riskSeries = [
                            {
                                time: bar.time,
                                value: openPosition.curRiskPct
                            },
                        ];
                    }
                }

                if (strategy.profitTarget) {
                    const profitDistance = strategy.profitTarget({
                        entryPrice: entryPrice,
                        position: openPosition,
                        bar: bar,
                        lookback: new DataFrame<number, InputBarT>(lookbackBuffer.data),
                        parameters: strategyParameters
                    });
                    openPosition.profitTarget = openPosition.direction === TradeDirection.Long
                        ? entryPrice + profitDistance
                        : entryPrice - profitDistance;
                }

                positionStatus = PositionStatus.Position;
                break;

            case PositionStatus.Position:
                assert(openPosition !== null); "Expected open position to already be initialised!"

                if (openPosition!.curStopPrice !== undefined) {
                    if (openPosition!.direction === TradeDirection.Long) {
                        if (bar.low <= openPosition!.curStopPrice!) {
                            closePosition(bar, openPosition!.curStopPrice!, "stop-loss");
                            break;
                        }
                    }
                    else {
                        if (bar.high >= openPosition!.curStopPrice!) {
                            closePosition(bar, openPosition!.curStopPrice!, "stop-loss");
                            break;
                        }
                    }
                }

                if (strategy.trailingStopLoss !== undefined) {
                    const trailingStopDistance = strategy.trailingStopLoss({
                        entryPrice: openPosition!.entryPrice,
                        position: openPosition!,
                        bar: bar,
                        lookback: new DataFrame<number, InputBarT>(lookbackBuffer.data),
                        parameters: strategyParameters
                    });
                    if (openPosition!.direction === TradeDirection.Long) {
                        const newTrailingStopPrice = bar.close - trailingStopDistance;
                        if (newTrailingStopPrice > openPosition!.curStopPrice!) {
                            openPosition!.curStopPrice = newTrailingStopPrice;
                        }
                    }
                    else {
                        const newTrailingStopPrice = bar.close + trailingStopDistance;
                        if (newTrailingStopPrice < openPosition!.curStopPrice!) {
                            openPosition!.curStopPrice = newTrailingStopPrice;
                        }
                    }

                    if (options.recordStopPrice) {
                        openPosition!.stopPriceSeries!.push({
                            time: bar.time,
                            value: openPosition!.curStopPrice!
                        });
                    }
                }

                if (openPosition!.profitTarget !== undefined) {
                    if (openPosition!.direction === TradeDirection.Long) {
                        if (bar.high >= openPosition!.profitTarget!) {
                            closePosition(bar, openPosition!.profitTarget!, "profit-target");
                            break;
                        }
                    }
                    else {
                        if (bar.low <= openPosition!.profitTarget!) {
                            closePosition(bar, openPosition!.profitTarget!, "profit-target");
                            break;
                        }
                    }
                }
                updatePosition(openPosition!, bar);
                if (openPosition!.curRiskPct !== undefined && options.recordRisk) {
                    openPosition!.riskSeries!.push({
                        time: bar.time,
                        value: openPosition!.curRiskPct!
                    });
                }

                if (strategy.exitRule) {
                    strategy.exitRule(exitPosition, {
                        entryPrice: openPosition!.entryPrice,
                        position: openPosition!,
                        bar: bar,
                        lookback: new DataFrame<number, IndicatorBarT>(lookbackBuffer.data),
                        parameters: strategyParameters
                    });
                }

                break;

            case PositionStatus.Exit:
                assert(openPosition !== null); //"Expected open position to already be initialised!"

                closePosition(bar, bar.open, "exit-rule");
                break;
            default:
                throw new Error("Unexpected state!");
        }
    }

    if (openPosition) {
        const lastBar = indicatorsSeries.last();
        const lastTrade = finalizePosition(openPosition, lastBar.time, lastBar.close, "finalize");
        completedTrades.push(lastTrade);
    }

    return completedTrades;
}

