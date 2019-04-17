import { assert, expect } from 'chai';
import * as dataForge from 'data-forge';
import 'data-forge-indicators';
import * as path from 'path';
import { IStrategy, backtest, IBar, ITrade } from '../..';
import { IDataFrame } from 'data-forge';
import { DataFrame } from 'data-forge';
import { checkArray, checkDataFrameExpectations, checkArrayExpectations } from './check-object';
import { Stream } from 'stream';
import { StopLossFn, ProfitTargetFn, EntryRuleFn, ExitRuleFn } from '../../lib/strategy';

interface MyBar extends IBar {
    sma: number;
}

describe("backtest mean reversion", function (this: any) {
    
    this.timeout(25000);

    let inputSeries = dataForge.readFileSync(path.join(__dirname, "data/STW.csv"))
        .parseCSV()
        .parseDates("date", "dd/MM/YYYY")
        .parseFloats(["open", "high", "low", "close", "volume"])
        .setIndex("date") // Index so we can later merge on date.
        .renameSeries({ date: "time" });

    const movingAverage = inputSeries
        .deflate(bar => bar.close)          // Extract closing price series.
        .sma(30);                           // 30 day moving average.
    
    inputSeries = inputSeries
        .withSeries("sma", movingAverage)   // Integrate moving average into data, indexed on date.
        .skip(30)                           // Skip blank sma entries.

    interface IStrategyModifications {
        entryRule?: EntryRuleFn<MyBar>;
        exitRule?: ExitRuleFn<MyBar>;
        stopLoss?: StopLossFn<MyBar>;
        trailingStopLoss?: StopLossFn<MyBar>;
        profitTarget?: ProfitTargetFn<MyBar>;        
    }

    function meanReversionStrategy(modifications?: IStrategyModifications): IStrategy<MyBar> {
        let strategy: IStrategy<MyBar> = {
            entryRule: (enterPosition, args) => {
                if (args.bar.close < args.bar.sma) {
                    enterPosition();
                }
            },
    
            exitRule: (exitPosition, args) => {
                if (args.bar.close > args.bar.sma) {
                    exitPosition();
                }
            },
        };

        if (modifications) {
            strategy = Object.assign(strategy, modifications);
        }

        return strategy;
    }
    
    it("basic strategy", function  (this: any) {
        const strategy = meanReversionStrategy();    
        const trades = backtest(strategy, inputSeries);
        checkDataFrameExpectations(trades, this.test);
    });

    it("with stop loss", function  (this: any) {
        const strategy = meanReversionStrategy({
            stopLoss: args => args.entryPrice * (1.5/100),
        });

        const trades = backtest(strategy, inputSeries);
        checkDataFrameExpectations(trades, this.test);
    });

    it("with trailing stop", function  (this: any) {
        const strategy = meanReversionStrategy({
            trailingStopLoss: args => args.bar.close * (3/100),
        });
    
        const trades = backtest(strategy, inputSeries);
        checkDataFrameExpectations(trades, this.test);
    });

    it("with profit target", function  (this: any) {
        const strategy = meanReversionStrategy({
            profitTarget: args => args.entryPrice * (1/100),
        });
    
        const trades = backtest(strategy, inputSeries);
        checkDataFrameExpectations(trades, this.test);
    });

    it("with conditional buy", function  (this: any) {
        const strategy = meanReversionStrategy({
            entryRule: (enterPosition, args) => {
                enterPosition({ entryPrice: args.bar.close + (args.bar.close * (0.1/100)) })
            }
        });
    
        const trades = backtest(strategy, inputSeries);
        checkDataFrameExpectations(trades, this.test);
    });

    it("with maximum holding period", function  (this: any) {
        const strategy = meanReversionStrategy({
            exitRule: (exitPosition, args) => {
                if (args.position.holdingPeriod >= 3) {
                    exitPosition();
                }
            }
        });

        const trades = backtest(strategy, inputSeries);
        checkDataFrameExpectations(trades, this.test);
    });

    it("can record trailing stop", function  (this: any) {
        const strategy = meanReversionStrategy({
            trailingStopLoss: args => args.bar.close * (3/100),
        });

        const trades = backtest(strategy, inputSeries, { recordStopPrice: true });
        const stopPrice = trades.deflate().selectMany(trade => trade.stopPriceSeries!);
        checkArrayExpectations(stopPrice.toArray(), this.test);
    });

    it("can record risk", function  (this: any) {
        const strategy = meanReversionStrategy({
            stopLoss: args => args.entryPrice * (5/100),
        });

        const trades = backtest(strategy, inputSeries, { recordRisk: true });
        const risk = trades.deflate().selectMany(trade => trade.riskSeries!);
        checkArrayExpectations(risk.toArray(), this.test);
    });
});