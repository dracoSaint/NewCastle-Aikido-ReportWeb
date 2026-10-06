// IMPORTANT: This file should be in your .gitignore file to keep secrets out of version control.

// `var`, not `const`: auth.js may inject this file before the page's own <script> tag runs it again.
var config = {
  // Supabase (for future use)
  supabaseUrl: 'https://knnzybqudpdxhddcaxcv.supabase.co',
  supabaseAnonKey: 'sb_publishable_fPh3JNTjI5Loc32jDzhJkw_i5YHeS9l',

  // Google Sheets - Grading Report
  gradingSpreadsheetId: '1EmS3-3mxova9vQSavu-bYR05sGyve-q5CE2Xq12FLis',

  attendanceSpreadsheetId: '1ULOJ_f5-DpGZfY1raQWfTbFENAtnnvIYPSniUi06D_g',

  // Google Sheets - Monday Board Report
  mondayBoardSpreadsheetId: '1E9zvuJDxDCSpA7_zwlTZsKLeeK94K6rl8c77FKalpv8',
  mondayBoard: {
    thisWeekReportUrl: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vQQo8mdLaK_NEmRatCrbpPSVEWeEhoJ-SH_vMb5hYj7GQN2Oaw8SOKjGr-Xc7rrtisHxRk2J0A61a8Z/pubhtml?gid=626263845&single=true&widget=false&headers=false&chrome=false',
    lastWeekReportUrl: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vQQo8mdLaK_NEmRatCrbpPSVEWeEhoJ-SH_vMb5hYj7GQN2Oaw8SOKjGr-Xc7rrtisHxRk2J0A61a8Z/pubhtml?gid=1101005694&single=true&widget=false&headers=false&chrome=false'
  }
};