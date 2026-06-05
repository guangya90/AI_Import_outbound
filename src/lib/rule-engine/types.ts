/**
 * 通用导入规则引擎 - 类型定义
 * Universal Import Rule Engine - Type Definitions
 */

export type FileType = 'xlsx' | 'csv' | 'docx' | 'pdf';

/** 单元格原始值 */
export type CellValue = string | number | boolean | null;

/** 二维表格: sheets[0] = 当前工作表的所有行 */
export interface Sheet {
  name: string;
  rows: CellValue[][];
}

export interface ParsedDocument {
  fileType: FileType;
  fileName: string;
  sheets: Sheet[]; // 多Sheet文件会有多个
  fullText?: string; // PDF/Word 的纯文本内容
  pages?: { rows: CellValue[][]; text: string }[]; // PDF 多页
}

/** 字段映射: alias -> canonical */
export interface FieldAlias {
  canonical: string;
  aliases: string[];
  required?: boolean;
}

/** 系统规范字段（与考试要求一致） */
export const CANONICAL_FIELDS = {
  header: {
    外部编码: ['订单号', '单据编号', '外部单号', '配送单号', '配送汇总单号', '单据号', '外部编码'],
    收货门店: ['门店名称', '收货机构', '调入门店', '收货门店', '门店名', '店铺名', '门店'],
    收件人姓名: ['联系人', '收货人', '收件人', '收件人姓名', '姓名'],
    收件人电话: ['手机号', '联系电话', '收货电话', '电话', '联系人电话', '收件人电话'],
    收件人地址: ['送货地址', '详细地址', '收货地址', '收件地址', '地址', '收货机构地址'],
    备注: ['附注', '单据备注', '备注', '收货机构备注', '物品备注']
  } as Record<string, string[]>,
  detail: {
    SKU物品编码: ['商品编码', '物品编码', 'SKU编码', 'SKU物品编码', '外部商品编码', 'SKU条码'],
    SKU物品名称: ['商品名称', '物品名称', 'SKU名称', 'SKU物品名称'],
    SKU发货数量: ['订货数量', '发货数量', '应发数量', '数量', '出库数量', 'SKU发货数量', '下单数量'],
    SKU规格型号: ['规格', '规格型号', '物品规格', 'SKU规格型号']
  } as Record<string, string[]>
};

/** 标准输出订单 */
export interface OrderItem {
  外部编码: string;
  收货门店: string;
  收件人姓名: string;
  收件人电话: string;
  收件人地址: string;
  备注: string;
  details: DetailItem[];
  errors: string[];
  warnings: string[];
  sourceRow?: number;
  sourceFile?: string;
  sourceSheet?: string;
}

export interface DetailItem {
  SKU物品编码: string;
  SKU物品名称: string;
  SKU发货数量: string | number;
  SKU规格型号: string;
  errors: string[];
}

export interface ParseResult {
  orders: OrderItem[];
  totalRows: number;
  parseErrors: string[];
  ruleUsed: string;
}

/** PDF 纯文本 - 每行用正则抽取 */
export interface PdfTextHeaderStrategy {
  type: 'pdf-text';
  headerFields: Record<string, string>;
  detailPattern: string;
  detailFieldMap: { [k: number]: string };
  skipPatterns?: string[];
}

/** 规则: 头部抽取策略 */
export type HeaderStrategy =
  | { type: 'kv-rows'; rows: KvRowConfig[]; }
  | { type: 'static'; values: Record<string, string>; }
  | { type: 'inline'; fields: Record<string, string>; groupBy?: string; }
  | { type: 'matrix'; keyColumn: number; valueColumns: ValueColumnConfig[]; staticHeader?: Record<string, string> }
  | { type: 'card'; marker: string; headerPattern: KvRowConfig[]; itemStartAfterHeader: number; itemHeaderRow: number; }
  | { type: 'multi-sheet-footer'; sheetNameField: string; footerRows: KvRowConfig[]; headerRowIndex: number }
  | PdfTextHeaderStrategy;

export interface KvRowConfig {
  /** 行号,正数从0开始,负数从末尾(例如 -1 表示最后一行) */
  row: number;
  /** 字段映射: 左侧或上方 key (alias) -> 标准字段名 */
  fieldMap: Record<string, string>;
  /** 布局: horizontal=左右排布, vertical=上下排布 */
  layout?: 'horizontal' | 'vertical' | 'mixed';
  /** 仅在 key 单元格包含此子串时生效 */
  contains?: string;
}

export interface ValueColumnConfig {
  /** 列号 (0-based) */
  column: number;
  /** 列头文本 alias (用于匹配) */
  headerAlias?: string;
  /** 抽取后写入的字段 */
  field: string;
  /** 该值是 header (per-order) 还是 detail (per-row) */
  target: 'header' | 'detail';
}

/** 规则: 详情抽取 */
export interface DetailConfig {
  /** 数据起始行 (相对) */
  startRow: number;
  /** 结束标记: 包含该文本的行停止, 包含'合计','小计'等 */
  endMarkers?: string[];
  /** 起止范围: 正数=绝对行号, 负数=倒数 */
  rowRange?: { from: number; to: number };
  /** 列映射: 列号 -> 字段 alias */
  columnMap: Record<number, string>;
  /** 是否忽略空行 */
  skipEmpty?: boolean;
  /** 跨行聚合的列 (按该列分组共享 header) - 即 groupBy */
  groupByColumn?: number;
  /** 跨行聚合时聚合的 header 字段 (例如 配送单号) */
  groupHeaderField?: string;
}

/** 顶部干扰行处理 */
export interface SkipConfig {
  /** 头部跳过行数 (从顶部) */
  skipTopRows?: number;
  /** 头部跳过的特征: 包含此关键词的行将被跳过 */
  skipHeaderContains?: string[];
  /** 跳过的尾部行 (从末尾倒数) */
  skipBottomRows?: number;
}

export interface ParseRule {
  id: string;
  name: string;
  description?: string;
  /** 文件类型 */
  fileType: FileType;
  /** Sheet 处理: 'all'=遍历所有, 'first'=仅第一个, string[]=指定 sheet */
  sheetMode?: 'all' | 'first' | string[];
  /** 顶部/底部跳过 */
  skip?: SkipConfig;
  /** 表头抽取策略 */
  header: HeaderStrategy;
  /** 详情抽取配置 */
  detail: DetailConfig;
  /** 校验规则 */
  validations?: ValidationConfig[];
  /** 后处理 */
  postProcess?: {
    /** 合并同一外部编码 */
    mergeByExternalCode?: boolean;
    /** 填充默认门店(当只有收件人信息时) */
    defaultStoreFromSheetName?: boolean;
  };
}

export interface ValidationConfig {
  field: string;
  type: 'required' | 'phone' | 'positive-number' | 'non-empty' | 'regex';
  message: string;
  pattern?: string;
  /** 校验位置: header or detail */
  scope: 'header' | 'detail';
  onFail?: 'error' | 'warning' | 'note';
}
