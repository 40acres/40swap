data "external_schema" "gorm" {
  program = [
    "go",
    "run",
    "database/migrations/main.go"
  ]
}

env "gorm" {
  src = data.external_schema.gorm.url
  dev = "postgres://40swap:40swap@localhost:5432/40swap?sslmode=disable"
  
  migration {
    dir = "file://database/migrations"
    format = golang-migrate
  }
  
  format {
    migrate {
      diff = "{{ sql . }}"
    }
  }
  
  schemas = ["public"]
} 