// Code generated by gorm.io/gen. DO NOT EDIT.
// Code generated by gorm.io/gen. DO NOT EDIT.
// Code generated by gorm.io/gen. DO NOT EDIT.

package gen

import (
	"context"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"
	"gorm.io/gorm/schema"

	"gorm.io/gen"
	"gorm.io/gen/field"

	"gorm.io/plugin/dbresolver"

	"github.com/40acres/40swap/daemon/database/models"
)

func newSwapOut(db *gorm.DB, opts ...gen.DOOption) swapOut {
	_swapOut := swapOut{}

	_swapOut.swapOutDo.UseDB(db, opts...)
	_swapOut.swapOutDo.UseModel(&models.SwapOut{})

	tableName := _swapOut.swapOutDo.TableName()
	_swapOut.ALL = field.NewAsterisk(tableName)
	_swapOut.ID = field.NewInt64(tableName, "id")
	_swapOut.SwapID = field.NewString(tableName, "swap_id")
	_swapOut.Status = field.NewField(tableName, "status")
	_swapOut.AmountSats = field.NewInt64(tableName, "amount_sats")
	_swapOut.DestinationAddress = field.NewString(tableName, "destination_address")
	_swapOut.ServiceFeeSats = field.NewInt64(tableName, "service_fee_sats")
	_swapOut.OnchainFeeSats = field.NewInt64(tableName, "onchain_fee_sats")
	_swapOut.OffchainFeeSats = field.NewInt64(tableName, "offchain_fee_sats")
	_swapOut.DestinationChain = field.NewField(tableName, "destination_chain")
	_swapOut.ClaimPrivateKey = field.NewString(tableName, "claim_private_key")
	_swapOut.PaymentRequest = field.NewString(tableName, "payment_request")
	_swapOut.Description = field.NewString(tableName, "description")
	_swapOut.MaxRoutingFeeRatio = field.NewFloat64(tableName, "max_routing_fee_ratio")
	_swapOut.Outcome = field.NewField(tableName, "outcome")
	_swapOut.PreImage = field.NewField(tableName, "pre_image")
	_swapOut.TimeoutBlockHeight = field.NewInt64(tableName, "timeout_block_height")
	_swapOut.TxID = field.NewString(tableName, "tx_id")

	_swapOut.fillFieldMap()

	return _swapOut
}

type swapOut struct {
	swapOutDo swapOutDo

	ALL                field.Asterisk
	ID                 field.Int64
	SwapID             field.String
	Status             field.Field
	AmountSats         field.Int64
	DestinationAddress field.String
	ServiceFeeSats     field.Int64
	OnchainFeeSats     field.Int64
	OffchainFeeSats    field.Int64
	DestinationChain   field.Field
	ClaimPrivateKey    field.String
	PaymentRequest     field.String
	Description        field.String
	MaxRoutingFeeRatio field.Float64
	Outcome            field.Field
	PreImage           field.Field
	TimeoutBlockHeight field.Int64
	TxID               field.String

	fieldMap map[string]field.Expr
}

func (s swapOut) Table(newTableName string) *swapOut {
	s.swapOutDo.UseTable(newTableName)
	return s.updateTableName(newTableName)
}

func (s swapOut) As(alias string) *swapOut {
	s.swapOutDo.DO = *(s.swapOutDo.As(alias).(*gen.DO))
	return s.updateTableName(alias)
}

func (s *swapOut) updateTableName(table string) *swapOut {
	s.ALL = field.NewAsterisk(table)
	s.ID = field.NewInt64(table, "id")
	s.SwapID = field.NewString(table, "swap_id")
	s.Status = field.NewField(table, "status")
	s.AmountSats = field.NewInt64(table, "amount_sats")
	s.DestinationAddress = field.NewString(table, "destination_address")
	s.ServiceFeeSats = field.NewInt64(table, "service_fee_sats")
	s.OnchainFeeSats = field.NewInt64(table, "onchain_fee_sats")
	s.OffchainFeeSats = field.NewInt64(table, "offchain_fee_sats")
	s.DestinationChain = field.NewField(table, "destination_chain")
	s.ClaimPrivateKey = field.NewString(table, "claim_private_key")
	s.PaymentRequest = field.NewString(table, "payment_request")
	s.Description = field.NewString(table, "description")
	s.MaxRoutingFeeRatio = field.NewFloat64(table, "max_routing_fee_ratio")
	s.Outcome = field.NewField(table, "outcome")
	s.PreImage = field.NewField(table, "pre_image")
	s.TimeoutBlockHeight = field.NewInt64(table, "timeout_block_height")
	s.TxID = field.NewString(table, "tx_id")

	s.fillFieldMap()

	return s
}

func (s *swapOut) WithContext(ctx context.Context) ISwapOutDo { return s.swapOutDo.WithContext(ctx) }

func (s swapOut) TableName() string { return s.swapOutDo.TableName() }

func (s swapOut) Alias() string { return s.swapOutDo.Alias() }

func (s swapOut) Columns(cols ...field.Expr) gen.Columns { return s.swapOutDo.Columns(cols...) }

func (s *swapOut) GetFieldByName(fieldName string) (field.OrderExpr, bool) {
	_f, ok := s.fieldMap[fieldName]
	if !ok || _f == nil {
		return nil, false
	}
	_oe, ok := _f.(field.OrderExpr)
	return _oe, ok
}

func (s *swapOut) fillFieldMap() {
	s.fieldMap = make(map[string]field.Expr, 17)
	s.fieldMap["id"] = s.ID
	s.fieldMap["swap_id"] = s.SwapID
	s.fieldMap["status"] = s.Status
	s.fieldMap["amount_sats"] = s.AmountSats
	s.fieldMap["destination_address"] = s.DestinationAddress
	s.fieldMap["service_fee_sats"] = s.ServiceFeeSats
	s.fieldMap["onchain_fee_sats"] = s.OnchainFeeSats
	s.fieldMap["offchain_fee_sats"] = s.OffchainFeeSats
	s.fieldMap["destination_chain"] = s.DestinationChain
	s.fieldMap["claim_private_key"] = s.ClaimPrivateKey
	s.fieldMap["payment_request"] = s.PaymentRequest
	s.fieldMap["description"] = s.Description
	s.fieldMap["max_routing_fee_ratio"] = s.MaxRoutingFeeRatio
	s.fieldMap["outcome"] = s.Outcome
	s.fieldMap["pre_image"] = s.PreImage
	s.fieldMap["timeout_block_height"] = s.TimeoutBlockHeight
	s.fieldMap["tx_id"] = s.TxID
}

func (s swapOut) clone(db *gorm.DB) swapOut {
	s.swapOutDo.ReplaceConnPool(db.Statement.ConnPool)
	return s
}

func (s swapOut) replaceDB(db *gorm.DB) swapOut {
	s.swapOutDo.ReplaceDB(db)
	return s
}

type swapOutDo struct{ gen.DO }

type ISwapOutDo interface {
	gen.SubQuery
	Debug() ISwapOutDo
	WithContext(ctx context.Context) ISwapOutDo
	WithResult(fc func(tx gen.Dao)) gen.ResultInfo
	ReplaceDB(db *gorm.DB)
	ReadDB() ISwapOutDo
	WriteDB() ISwapOutDo
	As(alias string) gen.Dao
	Session(config *gorm.Session) ISwapOutDo
	Columns(cols ...field.Expr) gen.Columns
	Clauses(conds ...clause.Expression) ISwapOutDo
	Not(conds ...gen.Condition) ISwapOutDo
	Or(conds ...gen.Condition) ISwapOutDo
	Select(conds ...field.Expr) ISwapOutDo
	Where(conds ...gen.Condition) ISwapOutDo
	Order(conds ...field.Expr) ISwapOutDo
	Distinct(cols ...field.Expr) ISwapOutDo
	Omit(cols ...field.Expr) ISwapOutDo
	Join(table schema.Tabler, on ...field.Expr) ISwapOutDo
	LeftJoin(table schema.Tabler, on ...field.Expr) ISwapOutDo
	RightJoin(table schema.Tabler, on ...field.Expr) ISwapOutDo
	Group(cols ...field.Expr) ISwapOutDo
	Having(conds ...gen.Condition) ISwapOutDo
	Limit(limit int) ISwapOutDo
	Offset(offset int) ISwapOutDo
	Count() (count int64, err error)
	Scopes(funcs ...func(gen.Dao) gen.Dao) ISwapOutDo
	Unscoped() ISwapOutDo
	Create(values ...*models.SwapOut) error
	CreateInBatches(values []*models.SwapOut, batchSize int) error
	Save(values ...*models.SwapOut) error
	First() (*models.SwapOut, error)
	Take() (*models.SwapOut, error)
	Last() (*models.SwapOut, error)
	Find() ([]*models.SwapOut, error)
	FindInBatch(batchSize int, fc func(tx gen.Dao, batch int) error) (results []*models.SwapOut, err error)
	FindInBatches(result *[]*models.SwapOut, batchSize int, fc func(tx gen.Dao, batch int) error) error
	Pluck(column field.Expr, dest interface{}) error
	Delete(...*models.SwapOut) (info gen.ResultInfo, err error)
	Update(column field.Expr, value interface{}) (info gen.ResultInfo, err error)
	UpdateSimple(columns ...field.AssignExpr) (info gen.ResultInfo, err error)
	Updates(value interface{}) (info gen.ResultInfo, err error)
	UpdateColumn(column field.Expr, value interface{}) (info gen.ResultInfo, err error)
	UpdateColumnSimple(columns ...field.AssignExpr) (info gen.ResultInfo, err error)
	UpdateColumns(value interface{}) (info gen.ResultInfo, err error)
	UpdateFrom(q gen.SubQuery) gen.Dao
	Attrs(attrs ...field.AssignExpr) ISwapOutDo
	Assign(attrs ...field.AssignExpr) ISwapOutDo
	Joins(fields ...field.RelationField) ISwapOutDo
	Preload(fields ...field.RelationField) ISwapOutDo
	FirstOrInit() (*models.SwapOut, error)
	FirstOrCreate() (*models.SwapOut, error)
	FindByPage(offset int, limit int) (result []*models.SwapOut, count int64, err error)
	ScanByPage(result interface{}, offset int, limit int) (count int64, err error)
	Scan(result interface{}) (err error)
	Returning(value interface{}, columns ...string) ISwapOutDo
	UnderlyingDB() *gorm.DB
	schema.Tabler
}

func (s swapOutDo) Debug() ISwapOutDo {
	return s.withDO(s.DO.Debug())
}

func (s swapOutDo) WithContext(ctx context.Context) ISwapOutDo {
	return s.withDO(s.DO.WithContext(ctx))
}

func (s swapOutDo) ReadDB() ISwapOutDo {
	return s.Clauses(dbresolver.Read)
}

func (s swapOutDo) WriteDB() ISwapOutDo {
	return s.Clauses(dbresolver.Write)
}

func (s swapOutDo) Session(config *gorm.Session) ISwapOutDo {
	return s.withDO(s.DO.Session(config))
}

func (s swapOutDo) Clauses(conds ...clause.Expression) ISwapOutDo {
	return s.withDO(s.DO.Clauses(conds...))
}

func (s swapOutDo) Returning(value interface{}, columns ...string) ISwapOutDo {
	return s.withDO(s.DO.Returning(value, columns...))
}

func (s swapOutDo) Not(conds ...gen.Condition) ISwapOutDo {
	return s.withDO(s.DO.Not(conds...))
}

func (s swapOutDo) Or(conds ...gen.Condition) ISwapOutDo {
	return s.withDO(s.DO.Or(conds...))
}

func (s swapOutDo) Select(conds ...field.Expr) ISwapOutDo {
	return s.withDO(s.DO.Select(conds...))
}

func (s swapOutDo) Where(conds ...gen.Condition) ISwapOutDo {
	return s.withDO(s.DO.Where(conds...))
}

func (s swapOutDo) Order(conds ...field.Expr) ISwapOutDo {
	return s.withDO(s.DO.Order(conds...))
}

func (s swapOutDo) Distinct(cols ...field.Expr) ISwapOutDo {
	return s.withDO(s.DO.Distinct(cols...))
}

func (s swapOutDo) Omit(cols ...field.Expr) ISwapOutDo {
	return s.withDO(s.DO.Omit(cols...))
}

func (s swapOutDo) Join(table schema.Tabler, on ...field.Expr) ISwapOutDo {
	return s.withDO(s.DO.Join(table, on...))
}

func (s swapOutDo) LeftJoin(table schema.Tabler, on ...field.Expr) ISwapOutDo {
	return s.withDO(s.DO.LeftJoin(table, on...))
}

func (s swapOutDo) RightJoin(table schema.Tabler, on ...field.Expr) ISwapOutDo {
	return s.withDO(s.DO.RightJoin(table, on...))
}

func (s swapOutDo) Group(cols ...field.Expr) ISwapOutDo {
	return s.withDO(s.DO.Group(cols...))
}

func (s swapOutDo) Having(conds ...gen.Condition) ISwapOutDo {
	return s.withDO(s.DO.Having(conds...))
}

func (s swapOutDo) Limit(limit int) ISwapOutDo {
	return s.withDO(s.DO.Limit(limit))
}

func (s swapOutDo) Offset(offset int) ISwapOutDo {
	return s.withDO(s.DO.Offset(offset))
}

func (s swapOutDo) Scopes(funcs ...func(gen.Dao) gen.Dao) ISwapOutDo {
	return s.withDO(s.DO.Scopes(funcs...))
}

func (s swapOutDo) Unscoped() ISwapOutDo {
	return s.withDO(s.DO.Unscoped())
}

func (s swapOutDo) Create(values ...*models.SwapOut) error {
	if len(values) == 0 {
		return nil
	}
	return s.DO.Create(values)
}

func (s swapOutDo) CreateInBatches(values []*models.SwapOut, batchSize int) error {
	return s.DO.CreateInBatches(values, batchSize)
}

// Save : !!! underlying implementation is different with GORM
// The method is equivalent to executing the statement: db.Clauses(clause.OnConflict{UpdateAll: true}).Create(values)
func (s swapOutDo) Save(values ...*models.SwapOut) error {
	if len(values) == 0 {
		return nil
	}
	return s.DO.Save(values)
}

func (s swapOutDo) First() (*models.SwapOut, error) {
	if result, err := s.DO.First(); err != nil {
		return nil, err
	} else {
		return result.(*models.SwapOut), nil
	}
}

func (s swapOutDo) Take() (*models.SwapOut, error) {
	if result, err := s.DO.Take(); err != nil {
		return nil, err
	} else {
		return result.(*models.SwapOut), nil
	}
}

func (s swapOutDo) Last() (*models.SwapOut, error) {
	if result, err := s.DO.Last(); err != nil {
		return nil, err
	} else {
		return result.(*models.SwapOut), nil
	}
}

func (s swapOutDo) Find() ([]*models.SwapOut, error) {
	result, err := s.DO.Find()
	return result.([]*models.SwapOut), err
}

func (s swapOutDo) FindInBatch(batchSize int, fc func(tx gen.Dao, batch int) error) (results []*models.SwapOut, err error) {
	buf := make([]*models.SwapOut, 0, batchSize)
	err = s.DO.FindInBatches(&buf, batchSize, func(tx gen.Dao, batch int) error {
		defer func() { results = append(results, buf...) }()
		return fc(tx, batch)
	})
	return results, err
}

func (s swapOutDo) FindInBatches(result *[]*models.SwapOut, batchSize int, fc func(tx gen.Dao, batch int) error) error {
	return s.DO.FindInBatches(result, batchSize, fc)
}

func (s swapOutDo) Attrs(attrs ...field.AssignExpr) ISwapOutDo {
	return s.withDO(s.DO.Attrs(attrs...))
}

func (s swapOutDo) Assign(attrs ...field.AssignExpr) ISwapOutDo {
	return s.withDO(s.DO.Assign(attrs...))
}

func (s swapOutDo) Joins(fields ...field.RelationField) ISwapOutDo {
	for _, _f := range fields {
		s = *s.withDO(s.DO.Joins(_f))
	}
	return &s
}

func (s swapOutDo) Preload(fields ...field.RelationField) ISwapOutDo {
	for _, _f := range fields {
		s = *s.withDO(s.DO.Preload(_f))
	}
	return &s
}

func (s swapOutDo) FirstOrInit() (*models.SwapOut, error) {
	if result, err := s.DO.FirstOrInit(); err != nil {
		return nil, err
	} else {
		return result.(*models.SwapOut), nil
	}
}

func (s swapOutDo) FirstOrCreate() (*models.SwapOut, error) {
	if result, err := s.DO.FirstOrCreate(); err != nil {
		return nil, err
	} else {
		return result.(*models.SwapOut), nil
	}
}

func (s swapOutDo) FindByPage(offset int, limit int) (result []*models.SwapOut, count int64, err error) {
	result, err = s.Offset(offset).Limit(limit).Find()
	if err != nil {
		return
	}

	if size := len(result); 0 < limit && 0 < size && size < limit {
		count = int64(size + offset)
		return
	}

	count, err = s.Offset(-1).Limit(-1).Count()
	return
}

func (s swapOutDo) ScanByPage(result interface{}, offset int, limit int) (count int64, err error) {
	count, err = s.Count()
	if err != nil {
		return
	}

	err = s.Offset(offset).Limit(limit).Scan(result)
	return
}

func (s swapOutDo) Scan(result interface{}) (err error) {
	return s.DO.Scan(result)
}

func (s swapOutDo) Delete(models ...*models.SwapOut) (result gen.ResultInfo, err error) {
	return s.DO.Delete(models)
}

func (s *swapOutDo) withDO(do gen.Dao) *swapOutDo {
	s.DO = *do.(*gen.DO)
	return s
}
