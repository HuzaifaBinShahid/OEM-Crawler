export const selectors = {
  login: {
    userName: "#userName",
    password: "#password",
    submit: "#login",
    loginForm: "fieldset.loginFields",
  },

  modal: {
    closeButton: ".modal__button--close",
    closeButtonImg: ".modal__button--close img",
  },

  navigation: {
    internationalTab: 'a[href="#truck"][aria-controls="truck"]',
    internationalTabLi: 'li a[href="#truck"]',
    beginPartSearchButton: "#submitPartsSearchTruck",
    startPartsSearchContainer: "#startPartsSearchTruck",
  },

  vinForm: {
    cartName: "#cartName",
    vinInput: "#vinPartSearch",
    openCatalogButton: "#openCatalogPartSearch",
    searchBlock: ".searchBlock",
  },

  onCommand: {
    detailListTab: 'a[href="#figureListTab"]',
    detailListTabText: 'a:has-text("Detail List")',
    mostPopularTab: 'a[href="#quickReferenceTab"]',
    searchTab: 'a[href="#searchTab"]',
    wordSearch: "#wordSearch",
    wordSearchButton: "#wordSearchButton",
    tabStrip: ".nav.nav-tabs",
    messageModalClose: '.modal-header button.close[data-dismiss="modal"]',
    illustrationsList: "ul.list-group",
    treeNode: "li.list-group-item.node-tree",
    treeNodeLeaf: "li.list-group-item.node-tree .glyphicon-picture",
    treeExpandIcon: ".expand-icon.glyphicon-plus",
    partsTable: "#partsTable",
    partsTableBody: "#partsTable tbody",
    partsTableRows: "#partsTable tbody tr",
    partsTableFilter: "#partsTable_filter input, .dataTables_filter input",
    /** Related Parts link in OPTIONS column – opens modal with related parts table */
    relatedPartsLink: "img.relatedURL.cursor-pointer, td.parts-options img.relatedURL",
    /** Modal container and table for "Related Parts" */
    partOptionsModal: "#partOptionsContainer",
    partOptionsTable: "#partOptionsTable",
    partOptionsTableRows: "#partOptionsTable tbody tr",
    /** Modal close (e.g. jQuery UI dialog close) */
    partOptionsModalClose: ".ui-dialog-titlebar-close, #partOptionsContainer [data-dismiss='modal'], .modal-header button.close",
    /** Parts table pagination (DataTables) */
    partsTablePaginate: "#partsTable_paginate",
    partsTablePaginateNext: "#partsTable_paginate a.paginate_button.next:not(.disabled), #partsTable_next",
    partsTablePaginatePrev: "#partsTable_paginate a.paginate_button.previous:not(.disabled), #partsTable_previous",
    partsTablePaginateCurrent: "#partsTable_paginate a.paginate_button.current",
    partsTablePaginateButtons: "#partsTable_paginate a.paginate_button[data-dt-idx]",
  },

  buildSummary: {
    container: "text=Vehicle Build Summary",
    table: "table",
    summaryTable: ".table, table",
    keyValueRows:
      'table tr, .vehicle-build-summary tr, [class*="build"] table tr',
  },

  buildList: {
    container: "text=Vehicle Build List",
    table: "table",
    dataTable: "table.dataTable, table.table",
    rows: "table tbody tr",
    columns: {
      grp: "td:nth-child(1)",
      unit: "td:nth-child(2)",
      description: "td:nth-child(3)",
    },
    paginationSelect:
      'select[name="table_id_length"], .dataTables_length select, select',
    paginationNext: "a.next, .pagination .next a, li.next a",
    paginationPrev: "a.previous, .pagination .previous a, li.previous a",
    paginationInfo: ".dataTables_info",
    filterInput: 'input[type="search"], .dataTables_filter input',
  },
} as const;

export type Selectors = typeof selectors;
