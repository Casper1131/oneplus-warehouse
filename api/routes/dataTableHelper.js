// utils/dataTableHelper.js
const { Op } = require('sequelize');

async function dataTableQuery(model, req, columns = [], customWhere = {}) {
  const draw = parseInt(req.query.draw) || 0;
  const start = parseInt(req.query.start) || 0;
  const length = parseInt(req.query.length) || 10;
  const searchValue = req.query.search?.value || '';
  const order = req.query.order || [];
  const orderColumnIndex = order[0]?.column || 0;
  const orderDir = order[0]?.dir || 'asc';

  const orderBy = columns[orderColumnIndex] || 'id';

  const searchFilter = searchValue
    ? {
        [Op.or]: columns.map((col) => ({
          [col]: { [Op.like]: `%${searchValue}%` },
        })),
      }
    : {};

  const where = {
    ...customWhere,
    ...(searchValue ? searchFilter : {}),
  };

  const { count, rows } = await model.findAndCountAll({
    where,
    offset: start,
    limit: length,
    order: [[orderBy, orderDir]],
  });

  return {
    draw,
    recordsTotal: count,
    recordsFiltered: count,
    data: rows,
  };
}

module.exports = dataTableQuery;
