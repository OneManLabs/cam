export interface GrblConfig {
  useLineNumbers: boolean;
  decimalPlaces: number;
}

export const defaultGrblConfig: GrblConfig = {
  useLineNumbers: false,
  decimalPlaces: 3,
};
