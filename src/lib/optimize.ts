import { IDataFrame } from "data-forge";
import { performance } from "perf_hooks";
import { backtest } from "./backtest";
import { IBar } from "./bar";
import { Random } from "./random";
import { IStrategy } from "./strategy";
import { ITrade } from "./trade";
import { isArray, isFunction, isObject } from "./utils";

export type ObjectiveFn = (trades: ITrade[]) => number;

export type OptimizeSearchDirection = "max" | "min";

export interface IParameterDef {
    name: string;
    startingValue: number;
    endingValue: number;
    stepSize: number;
}

export type OptimizationType = "grid" | "hill-climb";

export interface IOptimizationOptions {
    searchDirection?: OptimizeSearchDirection;
    optimizationType?: OptimizationType;
    recordAllResults?: boolean;
    randomSeed?: number;
    numStartingPoints?: number;
    recordDuration?: boolean;
}

export type IterationResult<ParameterT> = (ParameterT & { result: number, numTrades: number });

export interface IOptimizationResult<ParameterT> {

    bestResult: number;
    bestParameterValues: ParameterT;
    allResults?: IterationResult<ParameterT>[];
    durationMS?: number;
}

interface OptimizationIterationResult {
    metric: number;
    numTrades: number;
}

function optimizationIteration<InputBarT extends IBar, IndicatorBarT extends InputBarT, ParameterT, IndexT>(
    strategy: IStrategy<InputBarT, IndicatorBarT, ParameterT, IndexT>, 
    parameters: IParameterDef[],
    objectiveFn: ObjectiveFn,
    inputSeries: IDataFrame<IndexT, InputBarT>,
    coordinates: number[]
        ): OptimizationIterationResult {

    const parameterOverride: any = {};
    for (let parameterIndex = 0; parameterIndex < parameters.length; ++parameterIndex) {
        const parameter = parameters[parameterIndex];
        parameterOverride[parameter.name] = coordinates[parameterIndex];
    }

    const strategyClone = Object.assign({}, strategy);
    strategyClone.parameters = Object.assign({}, strategy.parameters, parameterOverride);
    const trades = backtest<InputBarT, IndicatorBarT, ParameterT, IndexT>(strategyClone, inputSeries)
    return {
        metric: objectiveFn(trades),
        numTrades: trades.length,
    };
}

function* getNeighbours(coordinates: number[], parameters: IParameterDef[]): IterableIterator<number[]> {
    for (let i = 0; i < parameters.length; ++i) {
        const nextCoordinate = coordinates[i] += parameters[i].stepSize;
        if (nextCoordinate <= parameters[i].endingValue) {
            const nextCoordinates = coordinates.slice(); // Clone.
            nextCoordinates[i] = nextCoordinate;
            yield nextCoordinates;
        }
    }
    for (let i = 0; i < parameters.length; ++i) {
        const nextCoordinate = coordinates[i] -= parameters[i].stepSize;
        if (nextCoordinate >= parameters[i].startingValue) {
            const nextCoordinates = coordinates.slice(); // Clone.
            nextCoordinates[i] = nextCoordinate;
            yield nextCoordinates;
        }
    }
}

function extractParameterValues<ParameterT>(parameters: IParameterDef[], workingCoordinates: number[]): ParameterT {
    
    const bestParameterValues: any = {};

    for (let parameterIndex = 0; parameterIndex < parameters.length; ++parameterIndex) {
        const parameter = parameters[parameterIndex];
        bestParameterValues[parameter.name] = workingCoordinates[parameterIndex];
    }

    return bestParameterValues;
}

function packageIterationResult<ParameterT>(parameters: IParameterDef[], workingCoordinates: number[], result: OptimizationIterationResult): IterationResult<ParameterT> {
    const iterationResult: any = Object.assign(
        {},
        extractParameterValues(parameters, workingCoordinates),
        {
            result: result.metric,
            numTrades: result.numTrades,
        }
    );
    return iterationResult;
}

function acceptResult(workingResult: number, nextResult: number, options: IOptimizationOptions): boolean {

    if (options.searchDirection === "max") {
        if (nextResult > workingResult) {
            return true;
        }
    }
    else {
        if (nextResult < workingResult) {
            return true;
        }
    }

    return false;
}

function* iterateDimension(workingCoordinates: number[], parameterIndex: number, parameters: IParameterDef[]): IterableIterator<number[]> {

    const parameter = parameters[parameterIndex];

    for (let parameterValue = parameter.startingValue; parameterValue <= parameter.endingValue; parameterValue += parameter.stepSize) {

        const coordinatesHere = [...workingCoordinates, parameterValue];

        if (parameterIndex < parameters.length-1) {
            for (const coordinates of iterateDimension(coordinatesHere, parameterIndex+1, parameters)) {
                yield coordinates;
            }
        }
        else {
            yield coordinatesHere;
        }
    }
}

function* getAllCoordinates(parameters: IParameterDef[]): IterableIterator<number[]> {

    for (const coordinates of iterateDimension([], 0, parameters)) {
        yield coordinates;
    }
}

function hillClimbOptimization<InputBarT extends IBar, IndicatorBarT extends InputBarT, ParameterT, IndexT>(
    strategy: IStrategy<InputBarT, IndicatorBarT, ParameterT, IndexT>, 
    parameters: IParameterDef[],
    objectiveFn: ObjectiveFn,
    inputSeries: IDataFrame<IndexT, InputBarT>,
    options: IOptimizationOptions
        ): IOptimizationResult<ParameterT> {

    let bestResult: number | undefined;
    let bestCoordinates: number[] | undefined;
    const results: IterationResult<ParameterT>[] = [];

    const startTime = performance.now();

    const visitedCoordinates = new Map<number[], OptimizationIterationResult>();

    const random = new Random(options.randomSeed || 0);

    const numStartingPoints = options.numStartingPoints || 4;
    for (let startingPointIndex = 0; startingPointIndex < numStartingPoints; ++startingPointIndex) {
        let workingCoordinates: number[] = [];
        for (const parameter of parameters) {
            const randomIncrement = random.getInt(0, (parameter.endingValue - parameter.startingValue) / parameter.stepSize);
            const randomCoordinate = parameter.startingValue + randomIncrement * parameter.stepSize;
            workingCoordinates.push(randomCoordinate);
        }

        if (visitedCoordinates.has(workingCoordinates)) {
            continue;
        }

        let workingResult = optimizationIteration(strategy, parameters, objectiveFn, inputSeries, workingCoordinates);
        visitedCoordinates.set(workingCoordinates, workingResult);

        if (bestResult === undefined) {
            bestResult = workingResult.metric;
            bestCoordinates = workingCoordinates
        }
        else if (acceptResult(bestResult, workingResult.metric, options)) {
            bestResult = workingResult.metric;
            bestCoordinates = workingCoordinates;
        }

        if (options.recordAllResults) {
            results.push(packageIterationResult(parameters, workingCoordinates, workingResult));
        }
        while (true) {
            let gotBetterResult = false;
            let nextCoordinates: number[];
            for (nextCoordinates of getNeighbours(workingCoordinates!, parameters)) {

                const cachedResult = visitedCoordinates.get(workingCoordinates);
                const nextResult = cachedResult !== undefined ? cachedResult : optimizationIteration(strategy, parameters, objectiveFn, inputSeries, nextCoordinates);

                if (options.recordAllResults) {
                    results.push(packageIterationResult(parameters, workingCoordinates, workingResult));
                }
                if (acceptResult(bestResult, workingResult.metric, options)) {
                    bestResult = workingResult.metric;
                    bestCoordinates = workingCoordinates;
                }
                if (acceptResult(workingResult.metric, nextResult.metric, options)) {
                    workingCoordinates = nextCoordinates;
                    workingResult = nextResult;
                    gotBetterResult = true;

                    break;
                }
            }

            if (!gotBetterResult) {
                break;
            }
        }
    }

    return {
        bestResult: bestResult!,
        bestParameterValues: extractParameterValues(parameters, bestCoordinates!),
        durationMS: options.recordDuration ? (performance.now() - startTime) : undefined,
        allResults: options.recordAllResults ? results : undefined,
    };
}

function gridSearchOptimization<InputBarT extends IBar, IndicatorBarT extends InputBarT, ParameterT, IndexT>(
    strategy: IStrategy<InputBarT, IndicatorBarT, ParameterT, IndexT>,
    parameters: IParameterDef[],
    objectiveFn: ObjectiveFn,
    inputSeries: IDataFrame<IndexT, InputBarT>,
    options: IOptimizationOptions
        ): IOptimizationResult<ParameterT> {

    let bestResult: number | undefined;
    let bestCoordinates: number[] | undefined;
    const results: IterationResult<ParameterT>[] = [];

    const startTime = performance.now();

    for (const coordinates of getAllCoordinates(parameters)) {
        const iterationResult = optimizationIteration(strategy, parameters, objectiveFn, inputSeries, coordinates);
        if (bestResult === undefined) {
            bestResult = iterationResult.metric;
            bestCoordinates = coordinates;
        }
        else if (acceptResult(bestResult, iterationResult.metric, options)) {
            bestResult = iterationResult.metric;
            bestCoordinates = coordinates;
        }

        if (options.recordAllResults) {
            results.push(packageIterationResult(parameters, coordinates, iterationResult));
        }
    }

    return {
        bestResult: bestResult!,
        bestParameterValues: extractParameterValues(parameters, bestCoordinates!),
        durationMS: options.recordDuration ? (performance.now() - startTime) : undefined,
        allResults: options.recordAllResults ? results : undefined,
    };
}

export function optimize<InputBarT extends IBar, IndicatorBarT extends InputBarT, ParameterT, IndexT> (
    strategy: IStrategy<InputBarT, IndicatorBarT, ParameterT, IndexT>,
    parameters: IParameterDef[],
    objectiveFn: ObjectiveFn,
    inputSeries: IDataFrame<IndexT, InputBarT>,
    options?: IOptimizationOptions
        ): IOptimizationResult<ParameterT> {

    if (!isObject(strategy)) {
        throw new Error("Expected 'strategy' argument to 'optimize' to be an object that defines the trading strategy to be optimized.");
    }

    if (!isArray(parameters)) {
        throw new Error("Expected 'parameters' argument to 'optimize' to be an array that defines the various strategy parameters to be optimized.");
    }

    if (!isFunction(objectiveFn)) {
        throw new Error("Expected 'objectiveFn' argument to 'optimize' to be a function that computes an objective function for a set of trades.");
    }

    if (!isObject(inputSeries)) {
        throw new Error("Expected 'inputSeries' argument to 'optimize' to be a Data-Forge DataFrame object that provides the input data for optimization.");
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

    if (options.optimizationType === undefined) {
        options.optimizationType = "grid";
    }

    if (options.optimizationType === "hill-climb") {
        return hillClimbOptimization<InputBarT, IndicatorBarT, ParameterT, IndexT>(strategy, parameters, objectiveFn, inputSeries, options);
    }
    else if (options.optimizationType === "grid") {
        return gridSearchOptimization<InputBarT, IndicatorBarT, ParameterT, IndexT>(strategy, parameters, objectiveFn, inputSeries, options);
    }
    else {
        throw new Error(`Unexpected "optimizationType" field of "options" parameter to the "optimize" function. Expected "grid", or "hill-climb", Actual: "${options.optimizationType}".`);
    }
}
