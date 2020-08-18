export function greeting(userId, ruleChannelId, introChannelId) {
    return `Willkommen <@${userId}>! Lese dir doch bitte die <#${ruleChannelId}> durch und stelle dich anschließend auf unserem Server vor (<#${introChannelId}>). Nachdem du das getan hast, wird dich ein Mod schnellstmöglich für die anderen Channel freischalten.`;
}
export const description = `Begrüßt neue User`;
export const joinChannelInfo = `Der Channel, in welchem die Begrüßungs-Nachricht versendet werden soll.`;
export const ruleChannelInfo = `Der Regelchannel, welcher neuen Mitgliedern verlinkt werden soll.`;
export const introChannelInfo = `Der Vorstellungschannel, welcher neuen Mitgliedern verlinkt werden soll.`;
export const timeoutInfo = `In Sekunden, wie lange Mieps warten soll, bevor neue Mitglieder begrüßt werden.`;
//# sourceMappingURL=joinGreeting.js.map