import { Random } from "./random";
import { ITrade } from "./trade.js";
import { isArray, isNumber } from "./utils";

export interface IMonteCarloOptions {
    randomSeed?: number;
}

export function monteCarlo(trades: ITrade[], numIterations: number, numSamples: number, options?: IMonteCarloOptions): ITrade[][] {

    if (!isArray(trades)) {
        throw new Error("Expected 'trades' argument to 'monteCarlo' to be an array that contains a population of trades to sample during monte carlo simulation.");
    }

    if (!isNumber(numIterations) || numIterations < 1) {
        throw new Error("Expected 'numIterations' argument to 'monteCarlo' to be a number >= 1 that specifies the number of iteration of monte carlo simulation to perform.");
    }

    if (!isNumber(numSamples) || numSamples < 1) {
        throw new Error("Expected 'numSamples' argument to 'monteCarlo' to be a number >= 1 that specifies the size of the sample to create for each iteration of the monte carlo simulation.");
    }

    const numTrades = trades.length;
    if (numTrades === 0) {
        return [];
    }

    const random = new Random(options && options.randomSeed || 0);
    const samples: ITrade[][] = [];

    for (let iterationIndex = 0; iterationIndex < numIterations; ++iterationIndex) {
        const sample: ITrade[] = [];

        for (var tradeIndex = 0; tradeIndex < numSamples; ++tradeIndex) {
            var tradeCopyIndex = random.getInt(0, numTrades-1);
            sample.push(trades[tradeCopyIndex]);
        }

        samples.push(sample);
    }

    return samples;
}