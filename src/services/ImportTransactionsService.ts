import { getCustomRepository, getRepository, In } from 'typeorm';
import csvParse from 'csv-parse';
import fs from 'fs';
import Transaction from '../models/Transaction';
import Category from '../models/Category';
import TransactionRepository from '../repositories/TransactionsRepository';

interface CSVTransaction {
  title: string;
  type: 'income' | 'outcome';
  value: number;
  category: string;
}

class ImportTransactionsService {
  async execute(filePath: string): Promise<Transaction[]> {
    const transactionRepository = getCustomRepository(TransactionRepository);
    const categoriesRepository = getRepository(Category);

    const fileReadStream = fs.createReadStream(filePath);
    const parsers = csvParse({
      from_line: 2,
    });

    const parseCSV = fileReadStream.pipe(parsers);

    const transactions: CSVTransaction[] = [];
    let categories: string[] = [];

    parseCSV.on('data', async line => {
      const [title, type, value, category] = line.map((cell: string) =>
        cell.trim(),
      );

      if (!title || !type || !value) return;

      categories.push(category);
      transactions.push({ title, type, value, category });
    });

    await new Promise(resolve => parseCSV.on('end', resolve));

    categories = categories.filter(
      (value, index, self) => self.indexOf(value) === index,
    );

    const existentsCategories = await categoriesRepository.find({
      where: {
        title: In(categories),
      },
    });

    const newCategories = categories.filter(
      category =>
        !existentsCategories
          .map((category: Category) => category.title)
          .includes(category),
    );

    const addCategories = categoriesRepository.create(
      newCategories.map(title => ({
        title,
      })),
    );

    await categoriesRepository.save(addCategories);

    const allCategories = [...addCategories, ...existentsCategories];

    const createTransactions = transactionRepository.create(
      transactions.map(transaction => ({
        title: transaction.title,
        type: transaction.type,
        value: transaction.value,
        category: allCategories.find(
          category => category.title === transaction.category,
        ),
      })),
    );

    await transactionRepository.save(createTransactions);
    await fs.promises.unlink(filePath);

    // console.log(newCategories);
    console.log(allCategories);
    return createTransactions;
  }
}

export default ImportTransactionsService;
