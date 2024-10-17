export interface GrupaInfo {
    id: number,
    naziv: string,
    godinaUpisa: number
}

export interface PredmetInfo {
    id: number,
    naziv: string
}

export interface PredavanjeInfo {
    id: number,
    rb: number,
    datum: Date,
    tema: String
}