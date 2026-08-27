import { STATIONS } from './src/data/stations';
import { getRoute } from './src/utils/simRoute';
const origin = STATIONS.find(s => s.name === 'Magallanes');
const dest = STATIONS.find(s => s.name === 'Libertad');

if (!origin || !dest) {
    throw new Error('Test stations not found');
}

console.log(getRoute(origin, dest).map(s => s.id + ' (' + s.name + ' - ' + s.order + ')'));
