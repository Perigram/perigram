export const tableSchema = {
    columns: [
        {
            name: 'Type',
            required: true,
            type: 'String',
            description: 'Name of the part or file.'
        },
        {
            name: 'Amount',
            required: true,
            type: 'Number',
            description: 'Quantity of the part to be nested.',
            validation: (v) => Number.isInteger(v) && v > 0
        },
        {
            name: 'Rotation',
            required: false,
            type: 'Boolean',
            description: 'Whether the part is allowed to rotate during nesting.'
        },
        { name: 'A', required: false, type: 'Number', description: 'Custom parameter A.' },
        { name: 'B', required: false, type: 'Number', description: 'Custom parameter B.' },
        { name: 'C', required: false, type: 'Number', description: 'Custom parameter C.' },
        { name: 'D', required: false, type: 'Number', description: 'Custom parameter D.' },
        { name: 'E', required: false, type: 'Number', description: 'Custom parameter E.' },
        { name: 'F', required: false, type: 'Number', description: 'Custom parameter F.' },
        { name: 'G', required: false, type: 'Number', description: 'Custom parameter G.' },
        { name: 'H', required: false, type: 'Number', description: 'Custom parameter H.' },
    ]
};
