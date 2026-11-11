/* Each request gets a fresh disposable database. */
function comparable(result, ordered) {
  const rows = result.values.map(row => JSON.stringify(row));
  return JSON.stringify(ordered ? rows : rows.sort());
}
function execute(SQL, schema, sql) {
  const db = new SQL.Database();
  try {
    db.run(schema);
    db.run('PRAGMA query_only = ON;');
    let result = null, count = 0;
    for (const statement of db.iterateStatements(sql)) {
      count++;
      if (count > 1) throw new Error('한 번에 조회 쿼리 한 개만 실행하세요.');
      const columns = statement.getColumnNames(), values = [];
      if (!columns.length) throw new Error('결과를 반환하는 SELECT 또는 WITH 쿼리를 작성하세요.');
      while (statement.step()) {
        values.push(statement.get());
        if(values.length > 500) throw new Error('결과가 500행을 초과합니다. LIMIT으로 범위를 줄여주세요.');
      }
      result = {columns,values};
    }
    if (!result) throw new Error('실행할 SQL을 입력하세요.');
    return result;
  } finally {db.close();}
}
self.onmessage = async ({data}) => {
  try {
    const SQL = await initSqlJs();
    const result = execute(SQL, data.schema, data.sql);
    let passed = null;
    if(data.solution) {
      const matches = (a,b) => a.columns.length === b.columns.length && comparable(a,data.ordered) === comparable(b,data.ordered);
      passed = matches(result,execute(SQL,data.schema,data.solution));
      if (passed) passed = matches(execute(SQL,data.schema + data.variant,data.sql),execute(SQL,data.schema + data.variant,data.solution));
    }
    self.postMessage({result,passed});
  } catch (error) {self.postMessage({error:error.message});}
};
