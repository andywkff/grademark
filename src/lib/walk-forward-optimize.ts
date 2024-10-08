import { IDataFrame } from "data-forge";
import { backtest } from "./backtest";
import { IBar } from "./bar";
import { IOptimizationOptions, IParameterDef, ObjectiveFn, optimize } from "./optimize";
import { Random } from "./random";
import { IStrategy } from "./strategy";
import { ITrade } from "./trade";
import { isArray, isFunction, isNumber, isObject } from "./utils";

export interface IOptimizationResult {
    trades: ITrade[];
}

export function walkForwardOptimize<InputBarT extends IBar, IndicatorBarT extends InputBarT, ParameterT, IndexT>(
    strategy: IStrategy<InputBarT, IndicatorBarT, ParameterT, IndexT>,
    parameters: IParameterDef[],
    objectiveFn: ObjectiveFn,
    inputSeries: IDataFrame<IndexT, InputBarT>,
    inSampleSize: number,
    outSampleSize: number,
    options?: IOptimizationOptions
        ): IOptimizationResult {

    if (!isObject(strategy)) {
        throw new Error("Expected 'strategy' argument to 'walkForwardOptimize' to be an object that defines the trading strategy for to do the walk-forward optimization.");
    }

    if (!isArray(parameters) || parameters.length <= 0) {
        throw new Error("Expected 'parameters' argument to 'walkForwardOptimize' to be an array that specifies the strategy parameters that are to be optimized.");
    }

    if (!isFunction(objectiveFn)) {
        throw new Error("Expected 'objectiveFn' argument to 'walkForwardOptimize' to be a function that computes an objective function for a set of trades.");
    }

    if (!isObject(inputSeries) && inputSeries.count() > 0) {
        throw new Error("Expected 'inputSeries' argument to 'walkForwardOptimize' to be a Data-Forge DataFrame object that provides the input data for optimization.");
    }

    if (!isNumber(inSampleSize) || inSampleSize <= 0) {
        throw new Error("Expected 'inSampleSize' argument to 'walkForwardOptimize' to be a positive number that specifies the amount of data to use for the in-sample data set (the training data).");
    }

    if (!isNumber(outSampleSize) || outSampleSize <= 0) {
        throw new Error("Expected 'outSampleSize' argument to 'walkForwardOptimize' to be a positive number that specifies the amount of data to use for the out-of-sample data set (the testing data).");
    }

    if (!options) {
        options = {};
    }
    else {
        options = Object.assign({}, options);
    }

    if (options.searchDirection === undefined) {
        options.searchDirection = "max";
    }

    const random = new Random(options.randomSeed || 0);

    let workingDataOffset = 0;
    let trades: ITrade[] = []

    while (true) {
        const inSampleSeries = inputSeries.skip(workingDataOffset).take(inSampleSize).bake();
        const outSampleSeries = inputSeries.skip(workingDataOffset+inSampleSize).take(outSampleSize).bake();
        if (outSampleSeries.count() < outSampleSize) {
            break;
        }
        options.randomSeed = random.getReal();
        const optimizeResult = optimize(strategy, parameters, objectiveFn, inSampleSeries, options);
        const strategyClone = Object.assign({}, strategy);
        strategyClone.parameters = Object.assign({}, strategy.parameters, optimizeResult.bestParameterValues);
        const outSampleTrades = backtest(strategyClone, outSampleSeries);
        trades = trades.concat(outSampleTrades);
        workingDataOffset += outSampleSize;
    }

    return {
        trades: trades,
    };
}