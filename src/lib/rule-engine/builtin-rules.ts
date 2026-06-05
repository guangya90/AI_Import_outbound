import { ParseRule } from './types';

/**
 * 内置规则集 - 6 份演示文件
 * 这些规则展示了规则引擎如何适配不同格式
 */

export const BUILTIN_RULES: ParseRule[] = [
  /* ============== 规则 1: 黎明屯配送发货单 ============== */
  {
    id: 'liming-tun-fenghuang',
    name: '黎明屯配送发货单（42列/尾部收货信息）',
    description: '第1-2行是元信息/状态,第3行表头,第4-5行明细,第6行合计,第7-9行尾部含收货人/电话/地址',
    fileType: 'xlsx',
    sheetMode: 'first',
    skip: { skipTopRows: 0 },
    header: {
      type: 'kv-rows',
      rows: [
        // 倒数第3行: 单据号
        {
          row: -3,
          layout: 'horizontal',
          fieldMap: {
            单据号: '外部编码',
            上游单据: '上游单据'
          }
        },
        // 倒数第2行: 收货人/电话/地址 (这是关键收货信息)
        {
          row: -2,
          layout: 'horizontal',
          fieldMap: {
            收货人: '收件人姓名',
            收货电话: '收件人电话',
            收货地址: '收件人地址',
            备用联系人: '备用联系人',
            备用联系电话: '备用联系电话'
          }
        },
        // 倒数第1行: 备注
        {
          row: -1,
          layout: 'horizontal',
          fieldMap: {
            备注: '备注',
            收货机构备注: '备注'
          }
        },
        // 第2行(0-based: 1): 收货机构 -> 收货门店
        {
          row: 1,
          layout: 'horizontal',
          fieldMap: {
            收货机构: '收货门店',
            订货机构: '订货机构'
          }
        }
      ]
    },
    detail: {
      startRow: 3, // 第4行(0-based: 3)是表头
      rowRange: { from: 4, to: -4 }, // 数据行(到合计行之前)
      endMarkers: ['合计'],
      columnMap: {
        2: 'SKU物品编码',
        3: 'SKU物品名称',
        5: 'SKU规格型号',
        14: 'SKU发货数量'
      },
      skipEmpty: true
    }
  },

  /* ============== 规则 2: 湖南仓发货明细 (跨行聚合) ============== */
  {
    id: 'hunan-cang',
    name: '湖南仓发货明细（跨行聚合）',
    description: '第2行表头,数据行中每行均含完整 header,按配送单号跨行聚合多个 SKU',
    fileType: 'xlsx',
    sheetMode: 'first',
    skip: { skipTopRows: 0 },
    header: {
      type: 'inline',
      groupBy: '配送单号',
      fields: {
        收货机构: '收货门店',
        配送单号: '外部编码',
        配送汇总单号: '外部汇总编码',
        收货人: '收件人姓名',
        收货电话: '收件人电话',
        收货地址: '收件人地址',
        收货机构备注: '备注',
        单据备注: '备注'
      }
    },
    detail: {
      startRow: 2, // 数据行
      endMarkers: ['合计'],
      columnMap: {
        5: 'SKU物品编码',
        6: 'SKU物品名称',
        8: 'SKU规格型号',
        12: 'SKU发货数量'
      },
      skipEmpty: true
    }
  },

  /* ============== 规则 3: 欢乐牧场模板 (矩阵转置) ============== */
  {
    id: 'huanle-muchang-matrix',
    name: '欢乐牧场矩阵模板（SKU×门店）',
    description: '横向矩阵 SKU×门店,需展开为独立运单',
    fileType: 'xlsx',
    sheetMode: 'first',
    skip: { skipTopRows: 0 },
    header: {
      type: 'matrix',
      keyColumn: 0, // 不重要,会被 columnMap 覆盖
      staticHeader: { 备注: '欢乐牧场矩阵模板' },
      valueColumns: [
        { column: 13, headerAlias: '银泰店', field: '收货门店', target: 'header' },
        { column: 14, headerAlias: '金银潭店', field: '收货门店', target: 'header' },
        { column: 15, headerAlias: '金桥店', field: '收货门店', target: 'header' },
        { column: 16, headerAlias: '门店B', field: '收货门店', target: 'header' },
        { column: 17, headerAlias: '门店D', field: '收货门店', target: 'header' }
      ]
    },
    detail: {
      startRow: 1,
      endMarkers: ['合计', '小计', '总计'],
      columnMap: {
        4: 'SKU物品编码',  // 外部商品编码
        2: 'SKU物品名称',
        7: 'SKU规格型号'
      },
      skipEmpty: true
    }
  },

  /* ============== 规则 4: 多门店分Sheet出库单 (多Sheet合并) ============== */
  {
    id: 'multi-sheet-yingtai',
    name: '多门店分Sheet出库单（多Sheet合并）',
    description: '3个Sheet,每个Sheet是独立门店出库单,Sheet名即门店名,底部有收货信息',
    fileType: 'xlsx',
    sheetMode: 'all',
    skip: { skipTopRows: 3 }, // 跳过 标题/说明/空行
    header: {
      type: 'multi-sheet-footer',
      sheetNameField: '收货门店',
      headerRowIndex: 3,
      footerRows: [
        // 倒数第4行: 收货门店/联系人 (由于 skipTopRows,这里相对新 rows)
        { row: -4, layout: 'horizontal', fieldMap: { 收货门店: '收货门店', 联系人: '收件人姓名' } },
        // 倒数第3行: 联系电话/收货地址
        { row: -3, layout: 'horizontal', fieldMap: { 联系电话: '收件人电话', 收货地址: '收件人地址' } }
      ]
    },
    detail: {
      startRow: 1, // 在已 skipTopRows 后: 0=列头, 1..=数据
      endMarkers: ['合计'],
      columnMap: {
        1: 'SKU物品编码',
        2: 'SKU物品名称',
        3: 'SKU规格型号',
        5: 'SKU发货数量'
      },
      skipEmpty: true
    }
  },

  /* ============== 规则 6: 黔寨寨配送单 (PDF 配送单) ============== */
  {
    id: 'qianzhai-pdf',
    name: '黔寨寨配送单（PDF 配送单）',
    description: 'PDF 抽出的纯文本,头部 key:value 散落多行,明细每行格式: 序号+类别+SKU编码+名称+规格+单位+数量',
    fileType: 'pdf',
    sheetMode: 'first',
    skip: { skipTopRows: 0 },
    header: {
      type: 'pdf-text',
      headerFields: {
        单据编号: '外部编码',
        收货机构: '收货门店',
        订货机构: '订货机构',
        收货人: '收件人姓名',
        收货电话: '收件人电话',
        收货地址: '收件人地址'
      },
      // 明细行: 序号 + 类别 + ZBWP编码 + (名称+规格) + 单位 + 数量
      // 注: PDF 抽出的文本中 ZBWP 与名称之间无空格, 用 \s* 而非 \s+
      detailPattern: '^\\s*(\\d+)\\s*(饮品类|熟烙类|自助调料类|主食类|火锅菜类|工作服|其它)\\s*(ZBWP\\d+)\\s*(.+?)\\s*(件|瓶|包|盒|桶|码|袋|箱)\\s*(\\d+(?:\\.\\d+)?)\\s*$',
      detailFieldMap: {
        1: '__seq__',
        2: '物品类别',
        3: 'SKU物品编码',
        4: 'SKU物品名称',
        5: '订货单位',
        6: 'SKU发货数量'
      },
      // 跳过页脚、合计、列表头
      skipPatterns: [
        '^合\\s*计',
        '^\\s*第\\s*\\d+\\s*页',
        '^\\s*物品类别\\s*物品编码',
        '^\\s*制单日期',
        '^\\s*打印次数',
        '^\\s*收货人签字',
        '^\\s*备注\\s*[:：]?\\s*$',
        '^\\s*配送重量',
        '^\\s*黔寨寨'  // 标题行
      ]
    },
    detail: {
      startRow: 0,
      columnMap: {}, // pdf-text 模式不使用 columnMap
      skipEmpty: true
    }
  },

  /* ============== 规则 5: 门店调拨单-卡片式 (卡片拆分) ============== */
  {
    id: 'diao-card',
    name: '门店调拨单（卡片式）',
    description: '按"▶ 调拨记录 #N"识别卡片边界,每个卡片内含独立 header + 物品小表',
    fileType: 'xlsx',
    sheetMode: 'first',
    skip: { skipTopRows: 2 }, // 跳过标题/调拨单号
    header: {
      type: 'card',
      marker: '^▶\\s*调拨记录\\s*#?\\d+',
      headerPattern: [
        {
          row: 0, // 占位 - card 模式特殊处理
          layout: 'horizontal',
          fieldMap: {
            调入门店: '收货门店',
            收货人: '收件人姓名',
            电话: '收件人电话',
            收货地址: '收件人地址'
          }
        }
      ],
      itemStartAfterHeader: 0,
      itemHeaderRow: 0
    },
    detail: {
      startRow: 0, // 由 card 引擎处理
      columnMap: {
        0: 'SKU物品编码',
        1: 'SKU物品名称',
        2: 'SKU规格型号',
        3: 'SKU发货数量'
      },
      skipEmpty: true
    }
  }
];

/**
 * 工具: 用 kv-rows 抽取尾部收货信息的预置 helper
 * (此规则已经在 kv-rows 中以 -2 实现)
 */
