import * as Print from "expo-print";
export async function printSnapshot(html: string) { await Print.printAsync({ html }); }
