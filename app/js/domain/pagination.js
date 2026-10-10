/* Paginacion pura reutilizable: recibe una lista y nunca modifica sus datos. */
(function (global) {
  'use strict';
  const namespace = global.Metrologia = global.Metrologia || {};
  namespace.modules = namespace.modules || {};

  function paginate(items, requestedPage = 1, pageSize = 20) {
    const total = items.length;
    const pages = Math.max(1, Math.ceil(total / pageSize));
    const page = Math.min(Math.max(Number(requestedPage) || 1, 1), pages);
    const start = (page - 1) * pageSize;
    return { items: items.slice(start, start + pageSize), total, pages, page, start, end: Math.min(start + pageSize, total), pageSize };
  }

  namespace.modules.pagination = Object.freeze({ paginate });
})(window);
