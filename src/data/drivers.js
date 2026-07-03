// Built-in driver library. T/S values transcribed from publicly available
// manufacturer spec sheets; treat as approximate — always verify against the
// datasheet for a real build.
// Units: Fs Hz, Vas L, Re Ω, Bl T·m, Mms g, Cms mm/N, Sd cm², Le mH, Xmax mm.
export const BUILTIN_DRIVERS = [
  { brand: 'Dayton Audio', model: 'UM18-22 18"', Fs: 21.5, Qts: 0.53, Qes: 0.56, Qms: 8.9, Vas: 248, Re: 1.4, Bl: 18.7, Mms: 341, Cms: 0.16, Sd: 1140, Le: 2.9, Xmax: 22, Rms: 5.2 },
  { brand: 'Dayton Audio', model: 'UM15-22 15"', Fs: 22.4, Qts: 0.53, Qes: 0.56, Qms: 9.3, Vas: 148, Re: 1.4, Bl: 17.0, Mms: 260, Cms: 0.19, Sd: 810, Le: 2.7, Xmax: 22, Rms: 3.9 },
  { brand: 'Dayton Audio', model: 'UM12-22 12"', Fs: 24.4, Qts: 0.51, Qes: 0.54, Qms: 8.7, Vas: 65, Re: 1.4, Bl: 14.8, Mms: 175, Cms: 0.24, Sd: 480, Le: 2.4, Xmax: 19, Rms: 3.1 },
  { brand: 'Dayton Audio', model: 'RSS390HF-4 15"', Fs: 19.7, Qts: 0.42, Qes: 0.45, Qms: 6.3, Vas: 259, Re: 3.2, Bl: 17.4, Mms: 240, Cms: 0.27, Sd: 810, Le: 1.8, Xmax: 14, Rms: 4.7 },
  { brand: 'Dayton Audio', model: 'RSS315HF-4 12"', Fs: 22.0, Qts: 0.38, Qes: 0.41, Qms: 5.5, Vas: 116, Re: 3.4, Bl: 14.7, Mms: 165, Cms: 0.32, Sd: 500, Le: 1.6, Xmax: 14, Rms: 4.1 },
  { brand: 'Dayton Audio', model: 'RSS265HF-4 10"', Fs: 26.0, Qts: 0.41, Qes: 0.45, Qms: 4.9, Vas: 46, Re: 3.3, Bl: 12.2, Mms: 105, Cms: 0.36, Sd: 330, Le: 1.3, Xmax: 12, Rms: 3.5 },
  { brand: 'Sundown Audio', model: 'SA-12 D4', Fs: 32.0, Qts: 0.46, Qes: 0.50, Qms: 5.9, Vas: 38, Re: 3.8, Bl: 17.5, Mms: 190, Cms: 0.13, Sd: 480, Le: 2.8, Xmax: 16, Rms: 6.5 },
  { brand: 'Sundown Audio', model: 'SA-15 D4', Fs: 29.0, Qts: 0.47, Qes: 0.51, Qms: 6.2, Vas: 78, Re: 3.8, Bl: 18.9, Mms: 245, Cms: 0.12, Sd: 810, Le: 3.0, Xmax: 16, Rms: 7.2 },
  { brand: 'Sundown Audio', model: 'X-12 v3 D2', Fs: 30.5, Qts: 0.44, Qes: 0.47, Qms: 6.5, Vas: 33, Re: 1.9, Bl: 14.5, Mms: 235, Cms: 0.12, Sd: 480, Le: 2.2, Xmax: 25, Rms: 6.9 },
  { brand: 'Sundown Audio', model: 'X-15 v3 D2', Fs: 27.8, Qts: 0.45, Qes: 0.48, Qms: 6.8, Vas: 84, Re: 1.9, Bl: 16.4, Mms: 330, Cms: 0.10, Sd: 810, Le: 2.4, Xmax: 27, Rms: 8.5 },
  { brand: 'Sundown Audio', model: 'ZV5 18" D2', Fs: 27.0, Qts: 0.48, Qes: 0.52, Qms: 6.3, Vas: 130, Re: 1.8, Bl: 19.8, Mms: 480, Cms: 0.072, Sd: 1140, Le: 2.9, Xmax: 30, Rms: 12.9 },
  { brand: 'Fi Car Audio', model: 'BL 12 D2', Fs: 30.9, Qts: 0.44, Qes: 0.47, Qms: 6.7, Vas: 39, Re: 1.9, Bl: 14.9, Mms: 205, Cms: 0.13, Sd: 480, Le: 2.3, Xmax: 21, Rms: 5.9 },
  { brand: 'Fi Car Audio', model: 'BL 15 D2', Fs: 28.2, Qts: 0.45, Qes: 0.48, Qms: 6.9, Vas: 96, Re: 1.9, Bl: 16.6, Mms: 288, Cms: 0.11, Sd: 810, Le: 2.5, Xmax: 21, Rms: 7.4 },
  { brand: 'Fi Car Audio', model: 'Q 18 D2', Fs: 25.4, Qts: 0.47, Qes: 0.51, Qms: 6.0, Vas: 175, Re: 1.9, Bl: 18.5, Mms: 395, Cms: 0.099, Sd: 1140, Le: 2.7, Xmax: 28, Rms: 10.5 },
  { brand: 'SB Acoustics', model: 'SB34NRXL75-8 12"', Fs: 24.0, Qts: 0.38, Qes: 0.41, Qms: 5.9, Vas: 127, Re: 5.7, Bl: 15.5, Mms: 152, Cms: 0.29, Sd: 512, Le: 1.4, Xmax: 12, Rms: 3.9 },
  { brand: 'SB Acoustics', model: 'SB29NRX75-6 10"', Fs: 27.0, Qts: 0.37, Qes: 0.40, Qms: 5.5, Vas: 58, Re: 4.6, Bl: 12.4, Mms: 98, Cms: 0.35, Sd: 346, Le: 1.1, Xmax: 11, Rms: 3.0 },
  { brand: 'SB Acoustics', model: 'SB23NRXS45-8 8"', Fs: 29.0, Qts: 0.35, Qes: 0.38, Qms: 4.9, Vas: 30, Re: 5.9, Bl: 9.7, Mms: 55, Cms: 0.55, Sd: 235, Le: 0.7, Xmax: 9, Rms: 2.0 },
  { brand: 'Eminence', model: 'LAB 12', Fs: 22.0, Qts: 0.38, Qes: 0.40, Qms: 8.5, Vas: 118, Re: 5.7, Bl: 17.4, Mms: 168, Cms: 0.31, Sd: 480, Le: 1.6, Xmax: 13, Rms: 2.7 },
  { brand: 'Eminence', model: 'Kappalite 3015LF', Fs: 41.0, Qts: 0.39, Qes: 0.43, Qms: 4.6, Vas: 122, Re: 5.0, Bl: 17.1, Mms: 88, Cms: 0.17, Sd: 856, Le: 1.0, Xmax: 9, Rms: 5.0 },
  { brand: 'Eminence', model: 'Kappalite 3012LF', Fs: 39.0, Qts: 0.36, Qes: 0.39, Qms: 5.1, Vas: 79, Re: 5.1, Bl: 15.5, Mms: 71, Cms: 0.24, Sd: 519, Le: 0.9, Xmax: 9, Rms: 3.4 },
  { brand: 'B&C', model: '18SW115-4', Fs: 32.0, Qts: 0.24, Qes: 0.25, Qms: 5.5, Vas: 152, Re: 3.2, Bl: 26.0, Mms: 285, Cms: 0.087, Sd: 1210, Le: 1.9, Xmax: 15, Rms: 10.4 },
  { brand: 'B&C', model: '15DS100-4', Fs: 35.0, Qts: 0.26, Qes: 0.28, Qms: 4.5, Vas: 84, Re: 3.1, Bl: 22.6, Mms: 216, Cms: 0.096, Sd: 855, Le: 1.7, Xmax: 14, Rms: 10.6 },
  { brand: 'B&C', model: '21DS115-4', Fs: 30.0, Qts: 0.25, Qes: 0.26, Qms: 5.9, Vas: 268, Re: 3.3, Bl: 30.4, Mms: 386, Cms: 0.073, Sd: 1680, Le: 2.2, Xmax: 16, Rms: 12.3 },
  { brand: 'JL Audio', model: '12W7AE-3', Fs: 26.7, Qts: 0.47, Qes: 0.50, Qms: 8.6, Vas: 45, Re: 2.6, Bl: 15.4, Mms: 218, Cms: 0.16, Sd: 490, Le: 1.9, Xmax: 19, Rms: 4.3 },
  { brand: 'JL Audio', model: '10W6v3-D4', Fs: 28.5, Qts: 0.49, Qes: 0.53, Qms: 6.9, Vas: 27, Re: 3.6, Bl: 13.0, Mms: 145, Cms: 0.21, Sd: 350, Le: 1.6, Xmax: 15, Rms: 3.8 },
  { brand: 'Rockford Fosgate', model: 'T1D212', Fs: 33.0, Qts: 0.50, Qes: 0.54, Qms: 6.5, Vas: 42, Re: 1.9, Bl: 13.8, Mms: 180, Cms: 0.13, Sd: 480, Le: 2.0, Xmax: 16, Rms: 5.7 },
  { brand: 'Scan-Speak', model: '30W/4558T00 12"', Fs: 18.0, Qts: 0.36, Qes: 0.38, Qms: 7.7, Vas: 176, Re: 3.5, Bl: 14.5, Mms: 185, Cms: 0.42, Sd: 466, Le: 1.2, Xmax: 13, Rms: 2.7 },
  { brand: 'Peerless', model: 'XXLS-P830845 12"', Fs: 18.3, Qts: 0.36, Qes: 0.39, Qms: 5.4, Vas: 172, Re: 3.4, Bl: 14.3, Mms: 181, Cms: 0.42, Sd: 466, Le: 2.7, Xmax: 12.5, Rms: 3.9 },
]
