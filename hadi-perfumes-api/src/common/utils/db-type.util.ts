export const tstz = () =>
  process.env.NODE_ENV === 'test' ? 'datetime' : 'timestamptz';

export const inet = () =>
  process.env.NODE_ENV === 'test' ? 'varchar' : 'inet';

export const enumType = () =>
  process.env.NODE_ENV === 'test' ? 'varchar' : 'enum';
