import { Database } from '@cosmology/db-client';
import { PoolClient } from 'pg';

const main = async () => {
  const db = new Database();
  db.withTransaction(async (client: PoolClient) => {
    try {
      const result = await client.query('SELECT 1');
      console.log(result.rows);
    } catch (error) {
      console.error('Error executing query:', error);
    }
  });
};

main()
  .then(() => {
    console.log('yay');
  })
  .catch((e) => {
    console.error('An error occurred:', e);
  });
