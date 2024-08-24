const MersenneTwister = require('mersennetwister');

function getRandomArbitrary(random: any, min: number, max: number): number {
    return random.real() * (max - min) + min;
}

function getRandomInt(random: any, min: number, max: number): number {
    return Math.floor(random.real() * (max - min + 1)) + min;
}

export class Random {
    private random: any;

    constructor(seed: number) {
        this.random = new MersenneTwister(seed);
    }

    getReal(): number;

    getReal(min?: number, max?: number): number {
        if (min === undefined) {
            min = Number.MIN_VALUE;
        }

        if (max === undefined) {
            max = Number.MAX_VALUE;
        }
        return getRandomArbitrary(this.random, min, max);
    }

    getInt(min: number, max: number): number {
        return getRandomInt(this.random, min, max);
    }

}