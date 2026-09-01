'use strict';

const fs = require('fs');
const path = require('path');

const sourceRoot = process.argv[2];
if (!sourceRoot) {
    console.error('Usage: node scripts/build-monopoly-skin-catalog.js <directory-with-monopoly-groups>');
    process.exit(1);
}
const projectRoot = path.resolve(__dirname, '..');
const outRoot = path.join(projectRoot, 'monopoly', 'assets', 'skins', 'companies');

const groups = [
    { source: 'Автомобили', id: 'cars', title: 'Автомобили', tiles: [5, 15, 25, 35] },
    { source: 'Веб-сервисы', id: 'web', title: 'Веб-сервисы', tiles: [11, 13, 14] },
    { source: 'Рестораны', id: 'food', title: 'Рестораны', tiles: [26, 27, 29] },
    { source: 'Электроника', id: 'tech', title: 'Электроника', tiles: [37, 39] },
];

const mythic = new Set([
    'aston-martin-1', 'bentley-motors-2', 'bugatti-2', 'ferrari-emblem-1',
    'lamborghini', 'mclaren-automotive-logo', 'porsche-crest-logo', 'rolls-royce',
    'google-g-2015', 'instagram-2016-5', 'netflix-logo-icon', 'spotify-logo', 'telegram-1', 'youtube-6-1',
    'mcdonalds-7', 'starbucks-coffee', 'domino-s-pizza-3', 'pizza-hut', 'dunkin-donuts-1', 'hard-rock-cafe-1',
    'bose', 'samsung-electronics', 'sony-logo-1', 'huawei',
]);
const epic = new Set([
    'alfa-romeo-4', 'bmw-2', 'infiniti-logo-1', 'jaguar-cars', 'lexus', 'maserati-1', 'tesla-motors', 'volvo',
    'discord-6', 'facebook-3-2', 'logo-amazon', 'tiktok-icon-2', 'twitch-purple', 'twitter-logo-2',
    'baskin-robbins-5', 'chipotle-mexican-grill', 'dodo-pizza-logo-eng', 'papa-john-s-pizza-1', 'subway-13', 'taco-bell-1',
    'asus-4', 'jbl-1', 'lg-electronics', 'xiaomi-logo-2',
]);
const rare = new Set([
    'honda-auto-logo', 'hyundai-motor-company-2', 'jeep-7', 'kia', 'mazda-2', 'nissan-logo', 'toyota-vertical-logo', 'volkswagen-logo',
    'aliexpress-logo', 'dropbox-2', 'pinterest-2-1', 'reddit-4', 'slack-new-logo', 'whatsapp-8',
    'applebee-s-1', 'carl-s-jr-5', 'dairy-queen', 'ihop', 'krispy-kreme-doughnuts-1', 'wendy-s',
    'dell-2', 'hp-hewlett-packard', 'lenovo-2', 'philips-new',
]);

const displayNames = {
    'alfa-romeo-4': 'Alfa Romeo', 'aston-martin-1': 'Aston Martin', 'bentley-motors-2': 'Bentley',
    'bugatti-2': 'Bugatti', 'citroen-2009': 'Citroën', 'ferrari-emblem-1': 'Ferrari',
    'bmw-2': 'BMW', 'jeep-7': 'Jeep', 'kia': 'KIA',
    'honda-auto-logo': 'Honda', 'hyundai-motor-company-2': 'Hyundai', 'infiniti-logo-1': 'Infiniti',
    'jaguar-cars': 'Jaguar', 'kamaz-2': 'KAMAZ', 'lada-logo': 'LADA',
    'maserati-1': 'Maserati', 'mazda-2': 'Mazda', 'mclaren-automotive-logo': 'McLaren',
    'mitsubishi-1': 'Mitsubishi', 'nissan-logo': 'Nissan', 'peugeot-5': 'Peugeot',
    'porsche-crest-logo': 'Porsche', 'rolls-royce': 'Rolls-Royce', 'seat-1': 'SEAT',
    'skoda-6': 'Škoda', 'tesla-motors': 'Tesla', 'toyota-vertical-logo': 'Toyota',
    'volkswagen-logo': 'Volkswagen',
    'aliexpress-logo': 'AliExpress', 'discord-6': 'Discord', 'dropbox-2': 'Dropbox',
    'facebook-3-2': 'Facebook', 'google-g-2015': 'Google', 'instagram-2016-5': 'Instagram',
    'logo-amazon': 'Amazon', 'netflix-logo-icon': 'Netflix', 'ozon-logo-clear': 'Ozon',
    'pinterest-2-1': 'Pinterest', 'reddit-4': 'Reddit', 'signal-logo-1': 'Signal',
    'slack-new-logo': 'Slack', 'snapchat-1': 'Snapchat', 'spotify-logo': 'Spotify',
    'telegram-1': 'Telegram', 'tiktok-icon-2': 'TikTok', 'twitch-purple': 'Twitch',
    'twitter-logo-2': 'Twitter', 'vk-1': 'VK', 'wechat-logo-1': 'WeChat',
    'whatsapp-8': 'WhatsApp', 'youtube-6-1': 'YouTube', 'zoom-communications-logo-1': 'Zoom',
    'applebee-s-1': "Applebee's", 'arby-s': "Arby's", 'baskin-robbins-5': 'Baskin-Robbins',
    'carl-s-jr-5': "Carl's Jr.", 'chipotle-mexican-grill': 'Chipotle', 'dairy-queen': 'Dairy Queen',
    'denny-s-5': "Denny's", 'dodo-pizza-logo-eng': 'Dodo Pizza', 'domino-s-pizza-3': "Domino's",
    'dunkin-donuts-1': "Dunkin'", 'hard-rock-cafe-1': 'Hard Rock Cafe', 'ihop': 'IHOP',
    'krispy-kreme-doughnuts-1': 'Krispy Kreme', 'mcdonalds-7': "McDonald's",
    'papa-john-s-pizza-1': "Papa John's", 'pizza-hut': 'Pizza Hut',
    'popeyes-louisiana-kitchen': 'Popeyes', 'starbucks-coffee': 'Starbucks', 'subway-13': 'Subway',
    'taco-bell-1': 'Taco Bell', 'tgi-fridays': 'TGI Fridays', 'tim-hortons-3': 'Tim Hortons',
    'wendy-s': "Wendy's", 'white-castle-1': 'White Castle',
    'acer-2': 'Acer', 'asus-4': 'ASUS', 'canon-wordmark-1': 'Canon', 'dell-2': 'Dell',
    'hp-hewlett-packard': 'HP', 'jbl-1': 'JBL', 'lenovo-2': 'Lenovo', 'lg-electronics': 'LG',
    'philips-new': 'Philips', 'realme-1': 'realme', 'samsung-electronics': 'Samsung',
    'sony-logo-1': 'Sony', 'xiaomi-logo-2': 'Xiaomi',
};

const rarityMeta = {
    common: { bonusBps: 250, exchangeValue: 10 },
    rare: { bonusBps: 1000, exchangeValue: 25 },
    epic: { bonusBps: 2000, exchangeValue: 75 },
    mythic: { bonusBps: 3300, exchangeValue: 200 },
};

function rarityFor(stem) {
    if (mythic.has(stem)) return 'mythic';
    if (epic.has(stem)) return 'epic';
    if (rare.has(stem)) return 'rare';
    return 'common';
}

function viewBoxRatio(svg) {
    const match = svg.match(/viewBox=["']\s*[-\d.]+\s+[-\d.]+\s+([\d.]+)\s+([\d.]+)/i);
    if (!match) return 1;
    return Number(match[1]) / Math.max(1, Number(match[2]));
}

fs.mkdirSync(outRoot, { recursive: true });
const catalog = [];
for (const group of groups) {
    const srcDir = path.join(sourceRoot, group.source);
    const dstDir = path.join(outRoot, group.id);
    fs.mkdirSync(dstDir, { recursive: true });
    const files = fs.readdirSync(srcDir).filter(file => file.toLowerCase().endsWith('.svg')).sort();
    for (const file of files) {
        const stem = path.basename(file, '.svg');
        const svg = fs.readFileSync(path.join(srcDir, file), 'utf8');
        fs.copyFileSync(path.join(srcDir, file), path.join(dstDir, file));
        const rarity = rarityFor(stem);
        catalog.push({
            id: `${group.id}_${stem}`,
            name: displayNames[stem] || stem.replace(/[-_]+/g, ' ').replace(/\b\w/g, s => s.toUpperCase()),
            groupId: group.id,
            groupName: group.title,
            compatibleTiles: group.tiles,
            rarity,
            asset: `assets/skins/companies/${group.id}/${file}`,
            layout: viewBoxRatio(svg) > 2.2 ? 'wordmark' : 'badge',
            ...rarityMeta[rarity],
        });
    }
}

const output = {
    version: 1,
    case: { id: 'universal', name: 'Универсальный кейс', odds: { common: 70, rare: 22, epic: 7, mythic: 1 } },
    rarities: rarityMeta,
    skins: catalog,
};
fs.writeFileSync(path.join(projectRoot, 'monopoly', 'assets', 'skins', 'catalog.json'), JSON.stringify(output, null, 2) + '\n');
console.log(`Built ${catalog.length} Monopoly skins in ${outRoot}`);
