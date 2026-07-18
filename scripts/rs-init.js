// Inicializa o replica set na primeira execução.
// Uso: docker compose exec mongo1 mongosh --eval "$(cat scripts/rs-init.js)"
//
// Aguarda até o primário estar disponível antes de sair.

const MAX_WAIT = 60;
let waited = 0;

rs.initiate({
  _id: 'rs0',
  members: [
    { _id: 0, host: 'mongo1:27017', priority: 2 },
    { _id: 1, host: 'mongo2:27017', priority: 1 },
    { _id: 2, host: 'mongo3:27017', priority: 0, votes: 0 },
  ],
});

print('Aguardando eleição do primário...');
while (waited < MAX_WAIT) {
  const status = rs.status();
  const primary = status.members?.find(m => m.stateStr === 'PRIMARY');
  if (primary) {
    print(`Replica set pronto. Primário: ${primary.name}`);
    break;
  }
  sleep(2000);
  waited += 2;
}

if (waited >= MAX_WAIT) {
  print('AVISO: timeout aguardando primário. Verifique com rs.status().');
}
