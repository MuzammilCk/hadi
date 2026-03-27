export const tstz = () => process.env.NODE_ENV === 'test' ? 'datetime' : 'timestamptz';
