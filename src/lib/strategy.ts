import { IDataFrame } from "data-forge";
import { IBar } from "./bar";
import { IPosition } from "./position";

export enum TradeDirection {
    Long = "long",
    Short = "short",
}

export interface IEnterPositionOptions {
    direction?: TradeDirection;

    entryPrice?: number;
}

export type EnterPositionFn = (options?: IEnterPositionOptions) => void;

export type ExitPositionFn = () => void;

export interface IRuleParams<BarT extends IBar, ParametersT> {
    bar: BarT;
    lookback: IDataFrame<number, BarT>;
    parameters: ParametersT;
}
export interface IOpenPositionRuleArgs<BarT extends IBar, ParametersT> extends IRuleParams<BarT, ParametersT> {
    entryPrice: number;
    position: IPosition;
}

export interface IStopLossArgs<BarT extends IBar, ParametersT> extends IOpenPositionRuleArgs<BarT, ParametersT> {
}

export type StopLossFn<BarT extends IBar, ParametersT = any> = (args: IStopLossArgs<BarT, ParametersT>) => number;

export interface IProfitTargetArgs<BarT extends IBar, ParametersT> extends IOpenPositionRuleArgs<BarT, ParametersT> {
}

export type ProfitTargetFn<BarT extends IBar, ParametersT = any> = (args: IProfitTargetArgs<BarT, ParametersT>) => number;

export interface IEntryRuleArgs<BarT extends IBar, ParametersT> extends IRuleParams<BarT, ParametersT> {
}

export type EntryRuleFn<BarT extends IBar, ParametersT = any> = (enterPosition: EnterPositionFn, args: IEntryRuleArgs<BarT, ParametersT>) => void;

export interface IExitRuleArgs<BarT extends IBar, ParametersT> extends IOpenPositionRuleArgs<BarT, ParametersT> {
}

export type ExitRuleFn<BarT extends IBar, ParametersT = any> = (exitPosition: ExitPositionFn, args: IExitRuleArgs<BarT, ParametersT>) => void;

export interface IParameterBucket {
    [index: string]: number;
}

export interface IPrepIndicatorsArgs<InputBarT extends IBar, ParametersT, IndexT> {
    parameters: ParametersT;
    inputSeries: IDataFrame<IndexT, InputBarT>;
}

export type PrepIndicatorsFn<InputBarT extends IBar, IndicatorsBarT extends InputBarT, ParametersT, IndexT> = (args: IPrepIndicatorsArgs<InputBarT, ParametersT, IndexT>) => IDataFrame<IndexT, IndicatorsBarT>; 

export interface IStrategy<InputBarT extends IBar = IBar, IndicatorsBarT extends InputBarT = InputBarT, ParametersT = IParameterBucket, IndexT = number> {
    parameters?: ParametersT;
    lookbackPeriod?: number;
    prepIndicators?: PrepIndicatorsFn<InputBarT, IndicatorsBarT, ParametersT, IndexT>;
    entryRule: EntryRuleFn<IndicatorsBarT, ParametersT>;
    exitRule?: ExitRuleFn<IndicatorsBarT, ParametersT>;
    stopLoss?: StopLossFn<InputBarT, ParametersT>;
    trailingStopLoss?: StopLossFn<InputBarT, ParametersT>;
    profitTarget?: ProfitTargetFn<InputBarT, ParametersT>;
}